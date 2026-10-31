import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';

export function BrewTimer({visible,compact=false,onStatus}:{visible:boolean;compact?:boolean;onStatus?:(status:string)=>void}) {
  const [duration,setDuration]=useState(60);
  const [remaining,setRemaining]=useState(60);
  const [deadline,setDeadline]=useState<number|null>(null);
  const [finished,setFinished]=useState(false);
  const [started,setStarted]=useState(false);
  const end=useRef(deadline);end.current=deadline;
  useEffect(()=>{onStatus?.(`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')} · ${finished?'时间到':deadline!==null?'计时中':started?'已暂停':'未启动'}`);},[remaining,deadline,finished,started,onStatus]);
  useEffect(()=>{
    if(deadline===null)return;
    const update=()=>{const next=Math.max(0,Math.ceil((deadline-Date.now())/1000));setRemaining(next);if(next===0){setDeadline(null);setFinished(true);}};
    update();const interval=setInterval(update,200);
    document.addEventListener('visibilitychange',update);
    return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',update);};
  },[deadline]);
  function reset(seconds=duration){setDeadline(null);setRemaining(seconds);setFinished(false);setDuration(seconds);setStarted(false);}
  function toggle(){setStarted(true);if(end.current!==null){setRemaining(Math.max(0,Math.ceil((end.current-Date.now())/1000)));setDeadline(null);}else{const seconds=remaining||duration;setRemaining(seconds);setFinished(false);setDeadline(Date.now()+seconds*1000);}}
  return <section className={`brew-timer ${compact?'compact-timer':''}`} aria-label="制作计时器" hidden={!visible}>
    <div className="timer-heading"><span><Timer size={17}/>制作计时器</span><small>手动设置，按实际步骤启动</small></div>
    <div className="timer-main"><output className={finished?'timer-digits finished':'timer-digits'} aria-label="剩余时间">{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</output><button className="secondary-button" aria-label={deadline===null?'启动计时':'暂停计时'} onClick={toggle}>{deadline===null?<Play size={15}/>:<Pause size={15}/ >}{deadline===null?'开始':'暂停'}</button><button className="icon-button" aria-label="重置计时" onClick={()=>reset()}><RotateCcw size={17}/></button></div>
    <div className="timer-presets">{[30,60,180].map(n=><button key={n} aria-pressed={duration===n} onClick={()=>reset(n)}>{n<60?`${n} 秒`:`${n/60} 分钟`}</button>)}<label>自定秒数<input aria-label="自定义计时秒数" type="number" min="1" max="7200" value={duration} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>0&&n<=7200)reset(n);}}/></label></div>
    <p className="timer-note" role="status" aria-live="polite">{finished?'时间到，请检查这一杯。':'切换步骤继续计时；离开制作页或刷新页面结束计时，无系统通知。'}</p>
  </section>;
}
