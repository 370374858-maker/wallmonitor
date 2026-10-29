import { fillStatus, healthFrom, pipeStatus, speedStatus } from './rules.js';

const baseTime = ['09:30','10:00','10:30','11:00','11:30','12:00','12:30','14:30'];

const slots = {
  'C-28': {
    id: 'C-28',
    status: '浇筑中',
    profile: { type:'三管法', category:'标准槽段', depth:42, width:6.8, thickness:1, tremieCount:3, jointCount:2, start:'2026-08-21 08:12:00', duration:'06h 48m' },
    progress: { theory:36.2, actual:35.72, curing:34.94 },
    concrete: { actual:244.6, theory:232.9 },
    speed: { theory:2.72, actual:2.48, times:baseTime, theorySeries:[2.42,2.51,2.58,2.64,2.70,2.76,2.78,2.72], actualSeries:[2.31,2.46,2.41,2.55,2.62,2.71,2.67,2.48] },
    pressure: { value:.86, time:'15:00', times:['14:05','14:10','14:15','14:20','14:25','14:30','14:35','14:40','14:45','14:50','14:55','15:00'], values:[.72,.75,.78,.81,.79,.83,.87,.85,.89,.88,.84,.86] },
    volume: { times:baseTime, theorySeries:[84,99,114,130,148,169,188,232.9], actualSeries:[86,101,116,132,149,167,185,244.6] },
    pipes: [
      {id:'t1',name:'浇筑管 1',kind:'tremie',depth:40.02,diff:4.30},
      {id:'t2',name:'浇筑管 2',kind:'tremie',depth:40.92,diff:5.20},
      {id:'t3',name:'浇筑管 3',kind:'tremie',depth:39.52,diff:3.80},
      {id:'j1',name:'接头管 1',kind:'joint',depth:35.22,diff:.28},
      {id:'j2',name:'接头管 2',kind:'joint',depth:35.36,diff:.42}
    ],
    quality:{dataIntegrity:99.6},
    alarms:[
      {id:1,level:'info',time:'14:58',desc:'浇筑管 2 完成一次拔管记录',value:'5.20 m',status:'closed'},
      {id:2,level:'ok',time:'14:52',desc:'泵压恢复至稳定区间',value:'0.86 MPa',status:'closed'},
      {id:3,level:'warn',time:'14:41',desc:'实测速度低于理论速度',value:'-0.24 m/h',status:'open'},
      {id:4,level:'info',time:'14:27',desc:'第 18 车混凝土数据已入库',value:'59.60 m³',status:'closed'},
      {id:5,level:'ok',time:'14:12',desc:'接头管 1 距初凝面正常',value:'0.28 m',status:'closed'},
      {id:6,level:'info',time:'13:56',desc:'完成第 24 次测量记录',value:'35.72 m',status:'closed'}
    ]
  },
  'C-29': {
    id:'C-29',
    status:'重点关注',
    profile:{type:'三管法',category:'深槽段',depth:46,width:7.2,thickness:1.2,tremieCount:3,jointCount:2,start:'2026-08-21 06:45:00',duration:'08h 15m'},
    progress:{theory:31.85,actual:30.96,curing:29.84},
    concrete:{actual:284.2,theory:230.8},
    speed:{theory:2.36,actual:1.82,times:baseTime,theorySeries:[2.42,2.40,2.38,2.40,2.39,2.37,2.36,2.36],actualSeries:[2.28,2.20,2.16,2.08,2.03,1.98,1.91,1.82]},
    pressure:{value:1.18,time:'15:00',times:['14:05','14:10','14:15','14:20','14:25','14:30','14:35','14:40','14:45','14:50','14:55','15:00'],values:[.82,.86,.91,.94,1.02,1.08,1.15,1.22,1.26,1.21,1.19,1.18]},
    volume:{times:baseTime,theorySeries:[84,96,109,122,136,151,184,230.8],actualSeries:[91,108,126,146,167,188,210,284.2]},
    pipes:[
      {id:'t1',name:'浇筑管 1',kind:'tremie',depth:37.76,diff:6.80},
      {id:'t2',name:'浇筑管 2',kind:'tremie',depth:35.16,diff:4.20},
      {id:'t3',name:'浇筑管 3',kind:'tremie',depth:31.76,diff:.80},
      {id:'j1',name:'接头管 1',kind:'joint',depth:30.46,diff:.62},
      {id:'j2',name:'接头管 2',kind:'joint',depth:30.22,diff:.38}
    ],
    quality:{dataIntegrity:96.8},
    alarms:[
      {id:7,level:'danger',time:'14:59',desc:'浇筑管 3 埋深不足',value:'.80 m',status:'open'},
      {id:8,level:'danger',time:'14:57',desc:'接头管 1 超出初凝面安全差值',value:'.62 m',status:'open'},
      {id:9,level:'danger',time:'14:54',desc:'充盈系数超出控制上限',value:'1.23',status:'open'},
      {id:10,level:'warn',time:'14:48',desc:'浇筑管 1 埋深偏大',value:'6.80 m',status:'open'},
      {id:11,level:'danger',time:'14:42',desc:'实测浇筑速度偏低',value:'1.82 m/h',status:'open'},
      {id:12,level:'warn',time:'14:31',desc:'泵压出现短时抬升',value:'1.26 MPa',status:'open'}
    ]
  },
  'C-30': {
    id:'C-30',
    status:'浇筑中',
    profile:{type:'双管法',category:'标准槽段',depth:38,width:5.6,thickness:.8,tremieCount:2,jointCount:2,start:'2026-08-21 10:06:00',duration:'04h 54m'},
    progress:{theory:22.74,actual:22.46,curing:21.82},
    concrete:{actual:101.7,theory:98.4},
    speed:{theory:3.12,actual:3.06,times:baseTime,theorySeries:[2.91,3.02,3.08,3.14,3.18,3.16,3.14,3.12],actualSeries:[2.86,2.94,3.02,3.10,3.15,3.13,3.11,3.06]},
    pressure:{value:.74,time:'15:00',times:['14:05','14:10','14:15','14:20','14:25','14:30','14:35','14:40','14:45','14:50','14:55','15:00'],values:[.69,.71,.72,.70,.73,.75,.76,.74,.75,.73,.74,.74]},
    volume:{times:baseTime,theorySeries:[26,36,46,57,68,79,89,98.4],actualSeries:[27,37,47,58,69,79,89,101.7]},
    pipes:[
      {id:'t1',name:'浇筑管 1',kind:'tremie',depth:26.66,diff:4.20},
      {id:'t2',name:'浇筑管 2',kind:'tremie',depth:27.14,diff:4.68},
      {id:'t3',name:'浇筑管 3',kind:'tremie',depth:null,diff:null},
      {id:'j1',name:'接头管 1',kind:'joint',depth:22.18,diff:.36},
      {id:'j2',name:'接头管 2',kind:'joint',depth:22.26,diff:.44}
    ],
    quality:{dataIntegrity:100},
    alarms:[
      {id:13,level:'ok',time:'14:58',desc:'全部关键参数处于控制区间',value:'正常',status:'closed'},
      {id:14,level:'info',time:'14:49',desc:'完成第 16 次测量记录',value:'22.46 m',status:'closed'},
      {id:15,level:'ok',time:'14:36',desc:'理论与实测高度偏差稳定',value:'.28 m',status:'closed'},
      {id:16,level:'info',time:'14:18',desc:'第 12 车混凝土数据已入库',value:'12.70 m³',status:'closed'},
      {id:17,level:'ok',time:'14:04',desc:'泵压连续 30 分钟稳定',value:'.74 MPa',status:'closed'},
      {id:18,level:'info',time:'13:52',desc:'接头管拔管记录已更新',value:'.44 m',status:'closed'}
    ]
  }
};

function enrich(data) {
  const clone = JSON.parse(JSON.stringify(data));
  clone.concrete.fillCoefficient = clone.concrete.theory ? clone.concrete.actual / clone.concrete.theory : 0;
  clone.concrete.status = fillStatus(clone.concrete.fillCoefficient);
  clone.speed.status = speedStatus(clone.speed.actual);
  clone.pipes.forEach((pipe) => { pipe.status = pipeStatus(pipe); });
  clone.health = healthFrom(clone);
  clone.history = {
    pouring: clone.volume.times.map((time,index) => ({
      truckNo:index+11,
      concreteVolume:index ? clone.volume.actualSeries[index]-clone.volume.actualSeries[index-1] : clone.volume.actualSeries[index],
      theoreticalHeight:clone.progress.theory-(clone.volume.times.length-1-index)*1.1,
      speed:clone.speed.theorySeries[index],
      endedAt:time,
      cumulativeVolume:clone.volume.actualSeries[index]
    })),
    measurement:clone.speed.times.map((time,index) => ({
      sequenceNo:index+17,
      point1:clone.progress.actual-(clone.speed.times.length-1-index)*1.15+.04,
      point2:clone.progress.actual-(clone.speed.times.length-1-index)*1.15-.06,
      point3:clone.progress.actual-(clone.speed.times.length-1-index)*1.15+.02,
      point4:clone.progress.actual-(clone.speed.times.length-1-index)*1.15-.03,
      point5:clone.progress.actual-(clone.speed.times.length-1-index)*1.15+.07,
      point6:clone.progress.actual-(clone.speed.times.length-1-index)*1.15-.02,
      actualHeight:clone.progress.actual-(clone.speed.times.length-1-index)*1.15,
      measuredAt:time,
      speed:clone.speed.actualSeries[index]
    }))
  };
  clone.updatedAt = new Date().toISOString();
  return clone;
}

export function listMockSlots() {
  return Object.values(slots).map((slot) => ({ id:slot.id,status:slot.status,method:slot.profile.type,depth:slot.profile.depth }));
}

export function getMockSnapshot(slotId) {
  if (!slots[slotId]) throw new Error('Mock slot not found: ' + slotId);
  return enrich(slots[slotId]);
}

export function updateMockSlot(slotId, profile) {
  Object.assign(slots[slotId].profile, profile);
  return getMockSnapshot(slotId);
}

export function allMockAlerts() {
  return Object.values(slots).flatMap((slot) => slot.alarms.map((alarm) => ({...alarm,slotId:slot.id})));
}
