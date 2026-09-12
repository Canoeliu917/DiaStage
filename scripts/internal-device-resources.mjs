// Browser-only instrumentation for synthetic internal runs, never shipped by the app.
export function instrumentResources() {
  const timers=new Set(),intervals=new Set(),frames=new Set(),urls=new Set(),tracks=new Set(),audio=new Set();
  let fetches=0;
  const timeout=window.setTimeout.bind(window),clearTimeout=window.clearTimeout.bind(window);
  window.setTimeout=(fn,delay,...args)=>{let id;id=timeout(()=>{timers.delete(id);typeof fn==='function'?fn(...args):window.eval(fn)},delay);timers.add(id);return id};
  window.clearTimeout=id=>{timers.delete(id);clearTimeout(id)};
  const interval=window.setInterval.bind(window),clearInterval=window.clearInterval.bind(window);
  window.setInterval=(...args)=>{const id=interval(...args);intervals.add(id);return id};
  window.clearInterval=id=>{intervals.delete(id);clearInterval(id)};
  const raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame=fn=>{let id;id=raf(time=>{frames.delete(id);fn(time)});frames.add(id);return id};
  window.cancelAnimationFrame=id=>{frames.delete(id);cancel(id)};
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=create(blob);urls.add(url);return url};
  URL.revokeObjectURL=url=>{urls.delete(url);revoke(url)};
  const fetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{fetches++;try{return await fetch(...args)}finally{fetches--}};
  if(navigator.mediaDevices?.getUserMedia){
    const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{
      const stream=await get(...args);
      for(const track of stream.getTracks()) {tracks.add(track);const stop=track.stop.bind(track);track.stop=()=>{tracks.delete(track);stop()};track.addEventListener('ended',()=>tracks.delete(track),{once:true});}
      return stream;
    };
  }
  if(window.AudioContext){
    const NativeAudio=window.AudioContext;
    window.AudioContext=class extends NativeAudio {
      constructor(...args){super(...args);audio.add(this)}
      async close(){try{return await super.close()}finally{audio.delete(this)}}
    };
  }
  window.__diaResources=()=>({timers:timers.size,intervals:intervals.size,frames:frames.size,objectUrls:urls.size,audioContexts:audio.size,tracks:tracks.size,fetches,dom:document.querySelectorAll('*').length});
}
