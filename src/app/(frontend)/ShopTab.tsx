'use client'

import { useState } from 'react'
import './shop.css'

type Category = 'All' | 'Clothing' | 'Accessories' | 'Backgrounds'
type Item = { id: string; name: string; category: Exclude<Category, 'All'>; price: number; color: string; kind: 'shirt' | 'bottle' | 'mat' | 'cap' | 'scene'; tag?: string }
const items: Item[] = [
  { id: 'tee', name: 'Everyday training tee', category: 'Clothing', price: 120, color: '#7d6b91', kind: 'shirt', tag: 'FAN FAVORITE' },
  { id: 'bottle', name: 'Hydration buddy', category: 'Accessories', price: 80, color: '#00a99a', kind: 'bottle' },
  { id: 'cap', name: 'Off-duty cap', category: 'Clothing', price: 100, color: '#4e721d', kind: 'cap' },
  { id: 'mat', name: 'Find your flow mat', category: 'Accessories', price: 150, color: '#a38ab9', kind: 'mat' },
  { id: 'garden', name: 'Garden escape', category: 'Backgrounds', price: 200, color: '#b9cda1', kind: 'scene', tag: 'A LITTLE ZEN' },
  { id: 'sunset', name: 'Golden hour', category: 'Backgrounds', price: 200, color: '#e9b191', kind: 'scene' },
]

function ItemArt({ item }: { item: Item }) {
  return <svg viewBox="0 0 200 150" role="img" aria-label={item.name} className="shop-item-art">
    <ellipse cx="100" cy="130" rx="58" ry="8" fill="#201a23" opacity=".07" />
    <g fill={item.color} stroke="#201a23" strokeWidth="2.5" strokeLinejoin="round">
      {item.kind === 'shirt' && <><path d="m72 30-36 25 19 28 16-9v48h58V74l16 9 19-28-36-25-16 10H88Z" /><path d="M86 33q14 24 28 0" fill="none" /><path d="m93 82 6 6 12-16" fill="none" stroke="white" strokeWidth="4" /></>}
      {item.kind === 'bottle' && <><rect x="77" y="39" width="46" height="89" rx="15" /><rect x="83" y="24" width="34" height="19" rx="5" fill="#eee9df" /><path d="M84 65h32v37H84Z" fill="#ffffff77" stroke="none" /><path d="m101 72-8 14h9l-3 10 12-17h-10Z" fill="white" stroke="none" /></>}
      {item.kind === 'cap' && <><path d="M54 94V80a46 46 0 0 1 92 0v20Z" /><path d="M54 94q47-6 94 5l27 16q-61 17-121-3Z" /><path d="M100 35q-14 22-9 58" fill="none" opacity=".4" /><path d="m111 68 6 6 10-12" fill="none" stroke="white" /></>}
      {item.kind === 'mat' && <><path d="m38 104 48-70 85 36-48 63Z" /><path d="m56 105 37-54 56 24-33 43Z" fill="none" stroke="#ffffff77" /><ellipse cx="54" cy="109" rx="17" ry="20" /><ellipse cx="54" cy="109" rx="8" ry="10" fill="none" /></>}
      {item.kind === 'scene' && <><rect x="28" y="22" width="144" height="108" rx="16" /><circle cx="128" cy="52" r="18" fill="#fff0bc" stroke="none" /><path d="m29 99 44-42 40 44 30-24 28 26v12q0 15-15 15H44q-15 0-15-15Z" fill={item.id === 'garden' ? '#68814d' : '#b97978'} stroke="none" /><path d="M29 117q65-36 142 0v0q0 13-15 13H44q-15 0-15-13Z" fill={item.id === 'garden' ? '#425c34' : '#885d78'} stroke="none" /></>}
    </g>
  </svg>
}

export default function ShopTab({ avatar, evolved }: { avatar: string; evolved: boolean }) {
  const [view, setView] = useState<'shop' | 'closet'>('shop')
  const [category, setCategory] = useState<Category>('All')
  const [inventory, setInventory] = useState<{ coins: number; owned: string[] }>({ coins: 500, owned: [] })
  const { coins, owned } = inventory
  const [selected, setSelected] = useState<Item>(items[0])
  const [message, setMessage] = useState('')
  const [wearingTee, setWearingTee] = useState(false)
  const [tryingOn, setTryingOn] = useState(true)
  const [background, setBackground] = useState('garden')
  const teeAvailable = avatar === 'bunny' && !evolved
  const previewTee = teeAvailable && (tryingOn ? selected.id === 'tee' || wearingTee : wearingTee)
  const previewBackground = tryingOn && selected.category === 'Backgrounds' ? selected.id : background
  const avatarSrc = previewTee ? '/avatars/outfits/bunny-starter-tee.png' : `/avatars/${avatar}-${evolved ? 'evolved' : 'starter'}.png`
  const filtered = items.filter(item => (category === 'All' || item.category === category) && (view === 'shop' || owned.includes(item.id)))
  const isOwned = owned.includes(selected.id)
  const affordable = coins >= selected.price
  const canWear = selected.id === 'tee' && teeAvailable
  const equipped = canWear ? wearingTee : selected.category === 'Backgrounds' && background === selected.id
  const selectItem = (item: Item) => { setSelected(item); setTryingOn(true); setMessage('') }
  const purchase = () => {
    if (isOwned || !affordable) return
    setInventory(current => current.owned.includes(selected.id) || current.coins < selected.price ? current : ({ coins: current.coins - selected.price, owned: [...current.owned, selected.id] }))
    setMessage(`${selected.name} is in your closet. Nice find!`)
  }
  const applyItem = () => {
    if (!isOwned) return
    if (canWear) setWearingTee(value => !value)
    else if (selected.category === 'Backgrounds') setBackground(selected.id)
    setTryingOn(false)
    setMessage(equipped && canWear ? 'Back to the original look.' : 'Looking good! Your dressing room look is updated.')
  }
  return <section className="shop-page">
    <div className="shop-heading"><div><span className="eyebrow">THE FLEXI SHOP</span><h1>Style your Flexi.</h1><p>Your buddy. Your look. Your next chapter.</p></div><div className="coin-wallet"><span aria-hidden="true">✦</span><div><b>{coins.toLocaleString()}</b><small>Demo coins</small></div></div></div>
    <div className={`dressing-stage ${previewBackground === 'sunset' ? 'sunset-stage' : ''}`}>
      <div className="dressing-stage-label"><span className="eyebrow">YOUR AVATAR</span><h2>A little more you.</h2><p>Small upgrades. Big personality.</p></div>
      <span className="dressing-orbit" aria-hidden="true" /><span className="dressing-star star-one" aria-hidden="true">✦</span><span className="dressing-star star-two" aria-hidden="true">✧</span><div className="dressing-avatar"><img src={avatarSrc} alt={previewTee ? "Pip wearing the fitted lavender training tee" : "Your avatar in the dressing room"} /></div>
      <div className="dressing-caption"><span className="preview-dot" />{tryingOn && (canWear || selected.category === 'Backgrounds') ? 'Trying a fresh look' : 'Your dressing room look'}<button onClick={() => { setTryingOn(false); setMessage('Showing your current look.') }}>Reset preview ↺</button></div>
      <span className="dressing-floor" aria-hidden="true" />
    </div>
    <div className="shop-layout dressing-layout"><div className="shop-catalog"><div className="shop-section-heading"><div className="shop-view-tabs" aria-label="Collection">{(['shop', 'closet'] as const).map(value => <button key={value} aria-pressed={view === value} className={view === value ? 'selected' : ''} onClick={() => { setView(value); setCategory('All'); setMessage('') }}>{value === 'shop' ? 'Discover' : `My closet (${owned.length})`}</button>)}</div><span>{filtered.length} items</span></div>
      <div className="shop-filters" aria-label="Filter items">{(['All', 'Clothing', 'Accessories', 'Backgrounds'] as const).map(value => <button key={value} aria-pressed={category === value} className={category === value ? 'selected' : ''} onClick={() => setCategory(value)}>{value}</button>)}</div>
      <div className="shop-grid">{filtered.map(item => <button key={item.id} className={`shop-product ${selected.id === item.id ? 'selected' : ''}`} aria-pressed={selected.id === item.id} onClick={() => selectItem(item)}><div className={`shop-product-image ${item.kind === 'scene' ? 'scenery' : ''}`}>{item.tag && <span className="product-tag">{item.tag}</span>}<>{item.id === 'tee' && teeAvailable ? <img className="shop-fitted-thumbnail" src="/avatars/outfits/bunny-starter-tee.png" alt="Pip wearing the training tee" /> : <ItemArt item={item} />}</><span className="product-preview" aria-hidden="true">{selected.id === item.id ? '✓' : '+'}</span></div><div className="shop-product-info"><small>{item.category}</small><h3>{item.name}</h3><b>{owned.includes(item.id) ? '✓ Owned' : `✦ ${item.price}`}</b></div></button>)}</div>
      {filtered.length === 0 && <div className="shop-empty"><span aria-hidden="true">✧</span><h3>Your next favorite is waiting.</h3><p>{owned.length ? 'No owned items in this category yet.' : 'Find something you love and add it to your closet.'}</p><button onClick={() => { setView('shop'); setCategory('All') }}>Explore the shop →</button></div>}
    </div><aside className="shop-detail" aria-label="Selected item"><span className="eyebrow">THE LITTLE DETAILS</span><div className="shop-detail-art">{canWear ? <img className="shop-fitted-thumbnail" src="/avatars/outfits/bunny-starter-tee.png" alt="Fitted lavender tee on Pip" /> : <ItemArt item={selected} />}</div><small>{selected.category}</small><h2>{selected.name}</h2><p>{selected.category === 'Backgrounds' ? 'A fresh setting for your workout buddy’s next adventure.' : selected.category === 'Clothing' ? 'A new look for showing up and feeling good.' : 'A little extra personality for every training day.'}</p><span className="shop-fit-note">{canWear ? '✓ Tailored for starter Pip' : selected.category === 'Backgrounds' ? '↗ Preview it in your dressing room' : 'Item preview · Fitted artwork coming soon'}</span><div className="shop-price"><span>{isOwned ? 'In your closet' : 'Item price'}</span><b>✦ {selected.price}</b></div><button className="primary shop-buy" disabled={isOwned || !affordable} onClick={purchase}>{isOwned ? '✓ Added to closet' : affordable ? `Get for ${selected.price} coins` : 'Not enough coins'}</button>{isOwned && (canWear || selected.category === 'Backgrounds') && <button className="shop-wear" onClick={applyItem}>{equipped ? canWear ? 'Remove tee' : '✓ Background applied' : canWear ? 'Wear this look' : 'Use this background'}</button>}<p className="shop-notice">Demo mode · Your coins and closet reset on refresh.</p><div className="shop-feedback" role="status">{message}</div></aside></div>
  </section>
}
