import {randomUUID} from 'node:crypto';
import {configurationIdentity,initialChangeState,planSourceChange,pressureFrame} from '../shared/change-sync.js';

export class ChangeSyncEngine{
  constructor({config,source,api,store}){this.config=config;this.source=source;this.api=api;this.store=store;this.state=null;this.slot=null;}
  async load(){
    this.state=await this.store.load()??initialChangeState(this.config);
    if(this.state.format!==1||this.state.identity!==configurationIdentity(this.config))throw Error('绑定或单位配置已改变，不能沿用当前采集进度');
  }
  async save(){await this.store.save(this.state);}
  async finishPending(){
    if(!this.state.pending)return;
    for(let attempt=0;attempt<4;attempt++){
      const pending=this.state.pending;
      try{
        if(pending.kind==='slot-survey'){
          const result=await this.api.survey(this.config.slotId,pending.body);
          if((result?.observedDepth??result?.depth)!==pending.body.depth)throw Error('实测槽深响应不完整，保留原请求等待核对');
          this.state.slotDepthUpdates=(this.state.slotDepthUpdates??0)+(result.changed?1:0);
          this.state.comparison.slotDepth={depth:pending.body.depth,rawDepth:pending.body.rawDepth??pending.body.depth,timestamp:String(Date.parse(pending.body.observedAt)/1000)};
          this.state.pending=null;await this.save();return;
        }
        if(pending.kind==='joint-baseline'){
          const result=await this.api.initialize(this.config.slotId,pending.body);
          if(!result?.initializedDepths||Object.entries(pending.body.depths).some(([side,depth])=>result.initializedDepths[side]!==depth))throw Error('初始管深响应不完整，保留原请求等待核对');
          for(const [side,depth]of Object.entries(pending.body.depths))this.state.comparison.joints[side]={depth,timestamp:pending.timestamp};
          this.state.pending=null;await this.save();return;
        }
        const result=await this.api.submit(this.config.slotId,pending.body);
        if(!result||!Array.isArray(result.events)||!result.events.length)throw Error('保存响应缺少事件，保留原请求等待核对');
        this.state=pending.nextState;await this.save();return;
      }catch(error){
                                                                               
                                                                                    
        if(error.status===409&&(error.message==='槽段事件已更新，请刷新后重试；本次没有写入'||['joint-baseline','slot-survey'].includes(pending.kind)&&error.message==='槽段或历史数据已被其他页面修改，请重新加载并核对后再提交；本次没有覆盖任何数据')){
          const context=await this.api.context(this.config.slotId);
          pending.body={...pending.body,requestId:randomUUID(),baseRevision:context.baseRevision};await this.save();continue;
        }
        throw error;
      }
    }
    throw Error('槽段正在频繁更新，保留待提交记录稍后重试');
  }
  async archiveOnce(){
    if(!this.state)await this.load();
    await this.finishPending();
    const context=await this.api.context(this.config.slotId);
    if(context.readOnly)throw Error('目标槽段只读');this.slot=context.slot;
    const tables=await this.source.tables();
    if(!this.state.initialized){
      for(const table of tables){
        const latest=this.config.initialPosition==='latest'?await this.source.latest(table.name):null;
        this.state.cursors[table.name]=latest?(BigInt(latest.Id)>0n?BigInt(latest.Id)-1n:0n).toString():'0';
      }
      this.state.initialized=true;await this.save();
    }
    let processed=0,saved=0;
    for(const table of tables){
      for(let batch=0;batch<this.config.maxBatchesPerRound;batch++){
        const from=this.state.cursors[table.name]??'0',rows=await this.source.rows(table.name,from,this.config.batchSize);
        if(!rows.length)break;
        let previous=BigInt(from);
        for(const raw of rows){
          if(BigInt(raw.Id)<=previous)throw Error('源数据 Id 未严格递增');previous=BigInt(raw.Id);
          let plan=planSourceChange(this.config,this.slot,table.stream,raw,this.state.comparison);
          if(plan.surveyDepth){
            const current=await this.api.context(this.config.slotId);
            this.state.pending={kind:'slot-survey',source:{table:table.name,id:plan.row.id},body:{requestId:randomUUID(),baseRevision:current.baseRevision,...plan.surveyDepth,observedAt:plan.row.occurredAt,sourceRow:{table:table.name,id:plan.row.id}}};
            await this.save();await this.finishPending();
            this.slot=(await this.api.context(this.config.slotId)).slot;
            plan=planSourceChange(this.config,this.slot,table.stream,raw,this.state.comparison);
            if(plan.surveyDepth)throw Error('实测槽深状态未刷新，保留源行等待核对');
          }
          if(Object.keys(plan.initialDepths).length){
            const current=await this.api.context(this.config.slotId);
            this.state.pending={kind:'joint-baseline',source:{table:table.name,id:plan.row.id},timestamp:plan.row.timestamp,
              body:{requestId:randomUUID(),baseRevision:current.baseRevision,depths:plan.initialDepths,observedAt:plan.row.occurredAt}};
            await this.save();await this.finishPending();
            this.slot=(await this.api.context(this.config.slotId)).slot;
            plan=planSourceChange(this.config,this.slot,table.stream,raw,this.state.comparison);
            if(Object.keys(plan.initialDepths).length)throw Error('初始管深状态未刷新，保留源行等待核对');
          }
          const nextState={...structuredClone(this.state),pending:null,comparison:plan.comparison,rowsProcessed:this.state.rowsProcessed+1};
          nextState.cursors[table.name]=plan.row.id;
          if(plan.event){
            const current=await this.api.context(this.config.slotId);
            nextState.eventsSaved++;
            this.state.pending={source:{table:table.name,id:plan.row.id},body:{requestId:randomUUID(),baseRevision:current.baseRevision,events:[plan.event]},nextState};
                                                                               
                                                                                  
            await this.save();await this.finishPending();saved++;
          }else this.state=nextState;
          processed++;
        }
        await this.save();
        if(rows.length<this.config.batchSize)break;
      }
    }
    return {processed,saved,eventsSaved:this.state.eventsSaved,rowsProcessed:this.state.rowsProcessed};
  }
  async liveOnce(){
    const row=await this.source.latestPressure();
    if(!row)return {updated:0,reason:'source-empty'};
    return this.api.live(pressureFrame(this.config,row));
  }
}
