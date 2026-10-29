import { $ } from './format.js';

const colors = ['#00d4ff','#3a7bd5','#00f2a9','#ffb84d','#8f7bff','#ff7f9e'];
const charts = {};

function axisStyle() {
  return {
    axisLine:{lineStyle:{color:'rgba(107,147,184,.30)'}},
    axisTick:{show:false},
    axisLabel:{color:'#6b93b8',fontSize:10},
    splitLine:{lineStyle:{color:'rgba(107,147,184,.11)'}}
  };
}

function tooltip() {
  return {
    trigger:'axis',
    backgroundColor:'rgba(10,26,60,.94)',
    borderColor:'rgba(0,212,255,.4)',
    textStyle:{color:'#e6f7ff',fontSize:10}
  };
}

export function initCharts() {
  if (!window.echarts) throw new Error('ECharts 未加载');
  ['progress','speed','volume','pressure'].forEach((name) => {
    charts[name] = window.echarts.init($('#' + name + '-chart'), null, {renderer:'canvas'});
  });
  window.addEventListener('dashboard-visible',() => {
    Object.values(charts).forEach((chart) => chart.resize());
  });
}

export function updateCharts(data, speedMode = 'both') {
  if (!charts.progress) return;
  const theoryPercent = Math.min(100, data.progress.theory / data.profile.depth * 100);
  const actualPercent = Math.min(100, data.progress.actual / data.profile.depth * 100);

  charts.progress.setOption({
    animationDuration:900,
    series:[
      {
        type:'gauge',startAngle:90,endAngle:-269.99,radius:'86%',center:['50%','51%'],
        progress:{show:true,width:9,roundCap:true,itemStyle:{color:'#00d4ff'}},
        axisLine:{lineStyle:{width:9,color:[[1,'rgba(107,147,184,.13)']]}},
        axisTick:{show:false},splitLine:{show:false},axisLabel:{show:false},pointer:{show:false},anchor:{show:false},
        detail:{valueAnimation:true,formatter:actualPercent.toFixed(1)+'%',color:'#e6f7ff',fontSize:25,fontWeight:700,offsetCenter:[0,'-4%']},
        title:{show:true,color:'#6b93b8',fontSize:9,offsetCenter:[0,'24%']},
        data:[{value:actualPercent,name:'实际进度'}]
      },
      {
        type:'gauge',startAngle:90,endAngle:-269.99,radius:'66%',center:['50%','51%'],
        progress:{show:true,width:5,roundCap:true,itemStyle:{color:'#00f2a9'}},
        axisLine:{lineStyle:{width:5,color:[[1,'rgba(107,147,184,.09)']]}},
        axisTick:{show:false},splitLine:{show:false},axisLabel:{show:false},pointer:{show:false},detail:{show:false},
        data:[{value:theoryPercent}]
      }
    ]
  }, true);

  const speedSeries = [];
  if (speedMode !== 'actual') {
    speedSeries.push({
      name:'理论速度',type:'line',smooth:true,symbol:'none',
      lineStyle:{width:2,color:'#00d4ff',shadowColor:'rgba(0,212,255,.45)',shadowBlur:8},
      areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(0,212,255,.22)'},{offset:1,color:'rgba(0,212,255,.015)'}])},
      data:data.speed.theorySeries
    });
  }
  if (speedMode !== 'theory') {
    speedSeries.push({
      name:'实测速度',type:'line',smooth:true,symbol:'circle',symbolSize:4,
      lineStyle:{width:2,color:'#00f2a9',shadowColor:'rgba(0,242,169,.35)',shadowBlur:7},
      itemStyle:{color:'#00f2a9'},
      areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(0,242,169,.16)'},{offset:1,color:'rgba(0,242,169,.01)'}])},
      data:data.speed.actualSeries
    });
  }
  charts.speed.setOption({
    color:colors,
    animationDuration:800,
    grid:{top:34,left:8,right:12,bottom:5,containLabel:true},
    tooltip:tooltip(),
    legend:{top:0,right:2,textStyle:{color:'#6b93b8',fontSize:10},itemWidth:13,itemHeight:7},
    xAxis:{type:'category',boundaryGap:false,data:data.speed.times,...axisStyle()},
    yAxis:{type:'value',name:'m/h',nameTextStyle:{color:'#6b93b8',fontSize:9},...axisStyle()},
    series:speedSeries
  }, true);

  charts.volume.setOption({
    animationDuration:850,
    grid:{top:31,left:8,right:12,bottom:4,containLabel:true},
    tooltip:tooltip(),
    legend:{top:0,right:0,textStyle:{color:'#6b93b8',fontSize:9},itemWidth:12,itemHeight:6},
    xAxis:{type:'category',boundaryGap:false,data:data.volume.times,...axisStyle(),axisLabel:{color:'#6b93b8',fontSize:9,interval:1}},
    yAxis:{type:'value',...axisStyle(),axisLabel:{color:'#6b93b8',fontSize:9}},
    series:[
      {name:'理论方量',type:'line',smooth:true,symbol:'none',lineStyle:{width:2,color:'#3a7bd5'},data:data.volume.theorySeries},
      {
        name:'实际方量',type:'line',smooth:true,symbol:'none',
        lineStyle:{width:2.3,color:'#00d4ff',shadowColor:'rgba(0,212,255,.55)',shadowBlur:8},
        areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(0,212,255,.3)'},{offset:1,color:'rgba(0,212,255,.02)'}])},
        data:data.volume.actualSeries
      }
    ]
  }, true);

  const pressureValues = data.pressure.values.length ? data.pressure.values : [data.pressure.value];
  const pressureMin = Math.max(0, Math.floor((Math.min(...pressureValues) - .2) * 10) / 10);
  const pressureMax = Math.max(1.4, Math.ceil((Math.max(...pressureValues) + .2) * 10) / 10);
  charts.pressure.setOption({
    animationDuration:850,
    grid:{top:25,left:8,right:12,bottom:4,containLabel:true},
    tooltip:tooltip(),
    xAxis:{type:'category',boundaryGap:false,data:data.pressure.times,...axisStyle(),axisLabel:{color:'#6b93b8',fontSize:9,interval:1}},
    yAxis:{type:'value',min:pressureMin,max:pressureMax,...axisStyle(),axisLabel:{color:'#6b93b8',fontSize:9}},
    series:[{
      name:'泵压',type:'line',smooth:true,symbol:'none',
      markLine:{silent:true,symbol:'none',label:{show:false},lineStyle:{color:'rgba(255,184,77,.4)',type:'dashed'},data:[{yAxis:1.2}]},
      lineStyle:{width:2.4,color:'#ffb84d',shadowColor:'rgba(255,184,77,.5)',shadowBlur:9},
      areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(255,184,77,.28)'},{offset:1,color:'rgba(255,184,77,.015)'}])},
      data:data.pressure.values
    }]
  }, true);
}
