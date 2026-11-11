import React, { useEffect, useRef, useState } from 'react';
import { Layers3, Maximize2, Minus, Plus } from 'lucide-react';
import { supportedTop } from './stacking.mjs';

export const cabinets = ['Esquerda exterior', 'Esquerda interior', 'Centro', 'Direita interior', 'Direita exterior'];
export const shelves = [0, 1, 2, 3];

export function MoveFields({ item, onMove }) {
  const [cabinet, setCabinet] = useState(item.cabinet);
  const [shelf, setShelf] = useState(item.shelf);
  return <details className="move-fields"><summary>Posição na estante</summary><form onSubmit={event => {
    event.preventDefault();
    onMove({ mode: 'place', id: item.id, cabinet, shelf, layoutX: item.layoutX, layoutY: item.layoutY, rotation: item.rotation }).catch(() => {});
  }}><div className="form-grid">
    <label>Armário<select value={cabinet} onChange={event => setCabinet(Number(event.target.value))}>{cabinets.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
    <label>Prateleira<select value={shelf} onChange={event => setShelf(Number(event.target.value))}>{shelves.map(index => <option key={index} value={index}>Prateleira {index + 1}</option>)}</select></label>
  </div><button className="button secondary">Guardar posição</button></form></details>;
}

export function Cabinet({ items, doors, setDoors, onPlace, onEnlarge, onSelect, renderItem }) {
  const viewport = useRef(null);
  const gesture = useRef(null);
  const pan = useRef(null);
  const suppressClick = useRef(false);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(null);
  const [dragging, setDragging] = useState(null);
  const scale = zoom ?? fit;
  useEffect(() => {
    const element = viewport.current;
    const observer = new ResizeObserver(() => setFit(Math.min(1, element.clientWidth / 1075, window.innerHeight * .73 / 620)));
    observer.observe(element);
    const wheel = event => {
      event.preventDefault();
      const next = Math.max(.35, Math.min(2.5, scale * Math.exp(-event.deltaY * .0015)));
      if (next === scale) return;
      const bounds = element.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      setZoom(next);
      requestAnimationFrame(() => {
        element.scrollLeft = (element.scrollLeft + x) * next / scale - x;
        element.scrollTop = (element.scrollTop + y) * next / scale - y;
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); };
  }, [scale]);
  function panStart(event) {
    if (event.pointerType !== 'mouse' || (event.button !== 0 && event.button !== 1)) return;
    if (event.button === 0 && event.target.closest('button, a, input, select, textarea, [data-piece]')) return;
    const element = viewport.current;
    if (!element || (event.button === 0 && element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)) return;
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
    element.classList.add('is-panning');
  }
  function panMove(event) {
    const current = pan.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    const element = viewport.current;
    element.scrollLeft = current.left - (event.clientX - current.x);
    element.scrollTop = current.top - (event.clientY - current.y);
  }
  function panEnd(event) {
    if (!pan.current || pan.current.pointerId !== event.pointerId) return;
    pan.current = null;
    viewport.current?.classList.remove('is-panning');
  }
  function localPoint(event) {
    const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-slot]');
    if (!slot) return null;
    const space = slot.querySelector('.shelf-free-space');
    const box = space.getBoundingClientRect();
    return { cabinet: Number(slot.dataset.cabinet), shelf: Number(slot.dataset.shelf), layoutX: Math.max(5, Math.min(95, (event.clientX - box.left) / box.width * 100)), layoutY: 0, space };
  }
  function start(event, item) {
    if (!event.isPrimary || event.button !== 0 || gesture.current?.pinch) return;
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    suppressClick.current = false;
    gesture.current = { item, element: event.currentTarget, parent: event.currentTarget.parentElement, css: event.currentTarget.style.cssText, startX: event.clientX, startY: event.clientY, rotation: item.rotation || 0, touches: gesture.current?.touches };
    setDragging(item.id);
  }
  function move(event) {
    const current = gesture.current; if (!current?.item || current.pinch) return;
    if (Math.hypot(event.clientX-current.startX,event.clientY-current.startY)<5 && !current.last) return;
    const point = localPoint(event);
    if (!point) { current.last = null; return; }
    let rotation = event.shiftKey ? Math.max(-180, Math.min(180, current.rotation + (event.clientX - current.startX) / 2)) : current.rotation;
    const snap = Math.round(rotation / 90) * 90;
    if (Math.abs(rotation - snap) < 5) rotation = snap;
    const { space, ...position } = point;
    const element = current.element;
    const radians = rotation * Math.PI / 180;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const rotatedWidth = Math.abs(width*Math.cos(radians)) + Math.abs(height*Math.sin(radians));
    const rotatedHeight = Math.abs(height*Math.cos(radians)) + Math.abs(width*Math.sin(radians));
    const margin = Math.min(50, rotatedWidth / space.clientWidth * 50 + 1);
    position.layoutX = Math.max(margin, Math.min(100-margin, position.layoutX));
    const box = space.getBoundingClientRect();
    const ratio = box.width / space.clientWidth;
    if (!current.preview) {
      const preview = element.cloneNode(true);
      const originals = [element, ...element.querySelectorAll('*')];
      const copies = [preview, ...preview.querySelectorAll('*')];
      originals.forEach((original, index) => {
        const computed = getComputedStyle(original);
        for (const property of computed) copies[index].style.setProperty(property, computed.getPropertyValue(property));
      });
      preview.removeAttribute('data-piece');
      preview.className = 'placed-piece drag-preview';
      preview.setAttribute('aria-hidden', 'true');
      preview.querySelectorAll('button').forEach(button => { button.tabIndex = -1; });
      document.body.appendChild(preview);
      current.preview = preview;
    }
    const preview = current.preview;
    const previewWidth = rotatedWidth * ratio;
    const previewHeight = rotatedHeight * ratio;
    let center = box.left + box.width * position.layoutX / 100;
    const others = [...space.querySelectorAll('[data-piece]')].filter(other => other !== element);
    const allObstacles = others.map(other => other.getBoundingClientRect());
    const obstacles = allObstacles.filter(other => other.bottom > box.bottom - previewHeight);
    const supports = others.filter(other => {
      const book = items.find(item => item.id === other.dataset.itemId);
      return book?.type === 'book' && Math.abs((book.rotation || 0) % 180) < 1;
    }).map(other => {
      const book = items.find(item => item.id === other.dataset.itemId);
      const rect = other.getBoundingClientRect();
      const width = (book.bookWidth || 25) / 2.3 * ratio;
      const height = (book.bookHeight || 220) / 3.7 * ratio;
      const centerX = rect.left + rect.width / 2;
      return { left: centerX - width / 2, right: centerX + width / 2, top: rect.bottom - height };
    });
    const horizontal = Math.abs(Math.abs(rotation) - 90) < 1;
    const top = horizontal ? supportedTop(center-previewWidth/2, center+previewWidth/2, supports) : null;
    const stacking = horizontal && event.clientY < box.bottom - previewHeight - 12;
    let landingBottom = box.bottom;
    const candidates = [center, ...obstacles.flatMap(other => [other.left - previewWidth / 2 - 2, other.right + previewWidth / 2 + 2])];
    const valid = candidates.filter(x => x - previewWidth / 2 >= box.left && x + previewWidth / 2 <= box.right &&
      obstacles.every(other => x + previewWidth / 2 <= other.left - 1 || x - previewWidth / 2 >= other.right + 1));
    valid.sort((a, b) => Math.abs(a-center) - Math.abs(b-center));
    let fits = valid.length > 0 && previewHeight <= box.height;
    if (stacking) {
      landingBottom = top ?? event.clientY + previewHeight / 2;
      fits = top !== null && top - previewHeight >= box.top &&
        center-previewWidth/2 >= box.left && center+previewWidth/2 <= box.right &&
        allObstacles.every(other => other.top >= top - 2 || other.bottom <= top-previewHeight ||
          other.right <= center-previewWidth/2 || other.left >= center+previewWidth/2);
    } else if (fits) center = valid[0];
    position.layoutY = (box.bottom - landingBottom) / box.height * 100;
    position.layoutX = (center - box.left) / box.width * 100;
    Object.assign(preview.style, {
      position: 'fixed', left: center + 'px', top: (landingBottom-previewHeight/2) + 'px',
      width: width + 'px', height: height + 'px', bottom: 'auto', padding: '0',
      margin: '0', rotate: 'none', transformOrigin: 'center',
      transform: 'translate(-50%, -50%) rotate(' + rotation + 'deg) scale(' + ratio + ')',
      outline: fits ? '2px solid #71805a' : '2px solid #bb4545',
      pointerEvents: 'none', zIndex: '2147483647', opacity: '1'
    });
    current.last = fits ? { ...position, rotation } : null;
    suppressClick.current = true;
  }
  function end() {
    const current = gesture.current;
    if (current?.element) current.element.style.cssText = current.css;
    current?.preview?.remove();
    gesture.current = null; setDragging(null);
    if (current?.last) onPlace({ mode: 'place', id: current.item.id, ...current.last }).catch(() => {});
  }
  function touchDown(event) {
    if (event.pointerType !== 'touch') return;
    const current = gesture.current ??= { touches: new Map() }; current.touches ??= new Map();
    current.touches.set(event.pointerId, [event.clientX, event.clientY]);
    if (current.touches.size === 2) { const [a, b] = [...current.touches.values()]; current.pinch = { distance: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: scale }; }
  }
  function touchMove(event) {
    const current = gesture.current; if (!current?.touches?.has(event.pointerId)) return;
    current.touches.set(event.pointerId, [event.clientX, event.clientY]);
    if (current.pinch && current.touches.size === 2) { const [a, b] = [...current.touches.values()]; setZoom(Math.max(.35, Math.min(2.5, current.pinch.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / current.pinch.distance))); }
  }
  function touchUp(event) { const current = gesture.current; current?.touches?.delete(event.pointerId); if (current?.touches?.size < 2 && current?.pinch) gesture.current = null; }
  return <><div className="cabinet-controls"><button className="icon-button" aria-label="Reduzir estante" onClick={() => setZoom(Math.max(.35, scale / 1.2))}><Minus size={17}/></button><span className="zoom-value">{Math.round(scale * 100)}%</span><button className="icon-button" aria-label="Ampliar estante" onClick={() => setZoom(Math.min(2.5, scale * 1.2))}><Plus size={17}/></button><span className="gesture-help">Roda para ampliar · arraste o fundo para mover · Shift+arrastar um livro para rodar</span><button className="text-button" onClick={() => { setZoom(null); viewport.current.scrollTo(0, 0); }}>Ajustar</button><button className="text-button" onClick={() => setDoors(value => !value)}><Layers3 size={15}/>{doors ? 'Abrir portas' : 'Fechar portas'}</button></div>
  <div className="cabinet-viewport" ref={viewport} tabIndex={0} aria-label="Vista da estante" onClickCapture={event => { if(suppressClick.current) { event.stopPropagation(); suppressClick.current=false; } }} onPointerDownCapture={touchDown} onPointerMoveCapture={touchMove} onPointerUpCapture={touchUp} onPointerCancelCapture={touchUp} onPointerDown={panStart} onPointerMove={panMove} onPointerUp={panEnd} onPointerCancel={panEnd}><div className="cabinet-scene wall-cabinets" style={{ zoom: scale }}><div className="cabinet-top-decor"><div className="top-vase"><span>⌁</span><i/></div><div className="little-frame">a vida<br/><em>entre livros.</em></div></div><div className={'cabinet-wall ' + (doors ? 'doors-closed' : '')}>{cabinets.map((name, cabinet) => <div key={name} className={'cabinet cabinet-column column-' + cabinet + (cabinet === 2 ? ' open-center' : '')}><div className="cabinet-inner">{shelves.map(shelf => <div key={shelf} className={'shelf shelf-level-' + shelf} data-slot data-cabinet={cabinet} data-shelf={shelf}><div className="shelf-back"/><button className="niche-zoom" aria-label={'Ampliar ' + name + ', prateleira ' + (shelf + 1)} onClick={() => onEnlarge({ cabinet, shelf })}><Maximize2 size={14}/></button><div className="shelf-free-space">{items.filter(item => item.cabinet === cabinet && item.shelf === shelf).map((item, index) => <div key={item.id} className={'placed-piece ' + (dragging === item.id ? 'dragging' : '')} data-piece data-item-id={item.id} style={{ left: Math.max(5,Math.min(90,item.layoutX || 5)) + '%', transform: 'translateX(-50%) rotate(' + (item.rotation || 0) + 'deg)', bottom: 'calc(' + (item.layoutY || 0) + '% + ' + ((Math.abs(Math.sin((item.rotation||0)*Math.PI/180))*(item.bookWidth||25)/2.3 + Math.abs(Math.cos((item.rotation||0)*Math.PI/180))*(item.bookHeight||220)/3.7 - (item.bookHeight||220)/3.7)/2) + 'px' }} onClick={() => onSelect(item)} onPointerDown={event => start(event, item)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>{renderItem(item, index)}</div>)}</div><div className="shelf-board"><span>{shelf + 1}</span></div></div>)}</div>{cabinet !== 2 && <div className={'glass-door ' + (cabinet === 0 || cabinet === 3 ? 'left-door' : 'right-door')}><div className="door-handle"/><div className="solid-door-panel"/></div>}<div className="cabinet-base"/></div>)}</div><div className="cabinet-shadow"/></div></div></>;
}
