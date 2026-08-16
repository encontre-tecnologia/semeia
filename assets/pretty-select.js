(function(){
  "use strict";
  const icons={cat:"FL",unit:"UN","product-category":"CT","product-type":"AL",processing:"PR","delivery-method":"EN",packaging:"EM"};
  function enhance(select){
    if(!select||select.dataset.prettyReady)return;
    select.dataset.prettyReady="1";
    select.classList.add("pretty-native");
    const shell=document.createElement("div"),trigger=document.createElement("button"),icon=document.createElement("span"),value=document.createElement("span"),menu=document.createElement("div");
    shell.className="pretty-select";trigger.type="button";trigger.className="pretty-trigger";trigger.setAttribute("aria-haspopup","listbox");trigger.setAttribute("aria-expanded","false");
    icon.className="pretty-icon";icon.setAttribute("aria-hidden","true");icon.textContent=select.dataset.selectIcon||icons[select.id]||"SE";
    value.className="pretty-value";
    const chevron=document.createElementNS("http://www.w3.org/2000/svg","svg");chevron.setAttribute("viewBox","0 0 24 24");chevron.setAttribute("fill","none");chevron.setAttribute("stroke","currentColor");chevron.setAttribute("stroke-width","2");chevron.setAttribute("aria-hidden","true");chevron.classList.add("pretty-chevron");
    const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d","m7 9 5 5 5-5");chevron.appendChild(path);
    menu.className="pretty-menu";menu.setAttribute("role","listbox");menu.hidden=true;
    select.parentNode.insertBefore(shell,select);shell.append(select,trigger,menu);trigger.append(icon,value,chevron);
    function close(){shell.classList.remove("is-open");menu.hidden=true;trigger.setAttribute("aria-expanded","false")}
    function open(){document.querySelectorAll(".pretty-select.is-open").forEach(function(other){if(other!==shell){other.classList.remove("is-open");const list=other.querySelector(".pretty-menu"),button=other.querySelector(".pretty-trigger");if(list)list.hidden=true;if(button)button.setAttribute("aria-expanded","false")}});shell.classList.add("is-open");menu.hidden=false;trigger.setAttribute("aria-expanded","true");const current=menu.querySelector(".is-selected")||menu.querySelector("button");if(current)setTimeout(function(){current.focus({preventScroll:true})},0)}
    function render(){
      const selected=select.options[select.selectedIndex];value.textContent=selected?selected.textContent:"Selecione…";trigger.disabled=select.disabled;menu.innerHTML="";
      Array.from(select.options).forEach(function(option,index){const button=document.createElement("button");button.type="button";button.className="pretty-option"+(option.selected?" is-selected":"");button.setAttribute("role","option");button.setAttribute("aria-selected",option.selected?"true":"false");button.textContent=option.textContent;button.disabled=option.disabled;button.onclick=function(){select.selectedIndex=index;select.dispatchEvent(new Event("change",{bubbles:true}));render();close();trigger.focus()};menu.appendChild(button)});
    }
    trigger.onclick=function(){shell.classList.contains("is-open")?close():open()};
    trigger.onkeydown=function(event){if(event.key==="ArrowDown"||event.key==="Enter"||event.key===" "){event.preventDefault();open()}if(event.key==="Escape")close()};
    menu.addEventListener("keydown",function(event){const items=Array.from(menu.querySelectorAll("button:not(:disabled)")),current=items.indexOf(document.activeElement);if(event.key==="Escape"){close();trigger.focus()}else if(event.key==="ArrowDown"){event.preventDefault();items[(current+1)%items.length]?.focus()}else if(event.key==="ArrowUp"){event.preventDefault();items[(current-1+items.length)%items.length]?.focus()}});
    select.addEventListener("change",render);select.addEventListener("invalid",function(){trigger.focus()});
    new MutationObserver(render).observe(select,{childList:true,attributes:true});
    document.addEventListener("click",function(event){if(!shell.contains(event.target))close()});render();
  }
  function enhanceAll(root){Array.from((root||document).querySelectorAll("select")).forEach(enhance)}
  window.SemeiaPrettySelect={enhance:enhance,enhanceAll:enhanceAll};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){enhanceAll(document)});else enhanceAll(document);
})();
