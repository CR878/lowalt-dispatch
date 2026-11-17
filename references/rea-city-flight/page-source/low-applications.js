(()=>{'use strict';
const mounted=new WeakSet();
function mount(){
 document.querySelectorAll('.la-page,.solution-detail').forEach(root=>{
  if(mounted.has(root))return;mounted.add(root);
  if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  root.classList.add('la-reveal-ready');
  const panel=root.closest('#detail-view');
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('la-in-view');observer.unobserve(entry.target);}}),{root:panel&&!panel.hidden?panel:null,threshold:.06,rootMargin:'0px 0px 25px 0px'});
  root.querySelectorAll('.la-section>.la-heading,.la-section>.la-card-grid,.la-section>.la-architecture,.la-console,.la-workflow,.la-scene-links,.la-brand-grid').forEach(el=>observer.observe(el));
 });
}
// In-page anchors stay inside the native detail scroll panel.
document.addEventListener('click',event=>{
 const link=event.target.closest('.la-page a[href^="#"]');if(!link)return;
 const id=link.getAttribute('href').slice(1),target=document.getElementById(id);if(!target)return;
 event.preventDefault();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 history.replaceState(null,'',location.pathname+location.search+'#'+encodeURIComponent(id));
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
})();
