/* One automatic solution prompt per tab visit; all manual contact entry points remain available. */
(() => {
  const cfg=window.AIRSPACE_CONTACTS||{},dialog=document.getElementById('contact-dialog');
  if(!dialog)return;
  const cta=dialog.querySelector('.expert-cta');
  try{const url=new URL(cfg.supportUrl);if(['http:','https:'].includes(url.protocol)&&cta){cta.href=url.href;cta.target='_blank';cta.rel='noopener noreferrer';}}catch{}
  const settings=cfg.solutionPopup||{};
  if(!settings.enabled)return;
  const prefix='airspace-solution-visit-v1:',seenKey=prefix+'shown',startKey=prefix+'started';
  let shown=false,timer,started=Date.now();
  try{shown=sessionStorage.getItem(seenKey)==='1';const saved=Number(sessionStorage.getItem(startKey));if(saved>0&&saved<=started)started=saved;else sessionStorage.setItem(startKey,String(started));}catch{}
  const delay=Math.max(1,Math.min(120,Number(settings.delaySeconds)||10))*1000;
  function remember(){shown=true;clearTimeout(timer);try{sessionStorage.setItem(seenKey,'1');}catch{}}
  function attempt(){
    if(shown)return;
    if(document.hidden)return;
    if(dialog.open){remember();return;}
    const busy=document.querySelector('dialog[open],.airspace-contact-panel:not([hidden])');
    if(busy||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')){timer=setTimeout(attempt,1000);return;}
    const opener=document.querySelector('.contact-btn[data-contact]');
    if(!opener)return;
    // Existing contact handler also stops the home video and maintains modal close/focus behavior.
    opener.click();if(dialog.open)remember();
  }
  function schedule(){clearTimeout(timer);if(!shown&&!document.hidden)timer=setTimeout(attempt,Math.max(0,delay-(Date.now()-started)));}
  document.addEventListener('click',event=>{if(event.target.closest('[data-contact]')&&!/预约.*演示/.test(event.target.closest('[data-contact]').textContent))remember();},true);
  document.addEventListener('visibilitychange',schedule);
  schedule();
})();
