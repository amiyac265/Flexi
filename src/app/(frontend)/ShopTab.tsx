'use client'

import { useState } from 'react'
import { Icon, FittedAvatar, type ShopItem, type Equipped } from './FlexiVisuals'
import './shop.css'
import { CoinPacksDialog } from './EconomyDialogs'
import type { useCoinEconomy } from './useCoinEconomy'

export default function ShopTab({
  avatar,
  evolved,
  items,
  owned,
  equipped,
  level,
  message,
  onPurchase,
  onEquip,
}: {
  avatar: { key: string; name: string }
  evolved: boolean
  items: ShopItem[]
  owned: string[]
  equipped: Equipped
  level: number
  message: string
  onPurchase: (item: ShopItem) => void
  onEquip: (item: ShopItem) => void
}) {
  const [view, setView] = useState<'shop' | 'closet'>('shop')
  const [category, setCategory] = useState<'all' | ShopItem['category']>('all')
  const [preview, setPreview] = useState<ShopItem | null>(null)
  const visible = items.filter(
    (item) =>
      (view === 'shop' || owned.includes(item.id)) &&
      (category === 'all' || item.category === category),
  )
  return (
    <section className="shop-page">
      <header className="shop-heading">
        <div>
          <span className="eyebrow">FLEXI SHOP</span>
          <h1>Make your buddy yours.</h1>
          <p>Try on fitted gear, unlock rewards, and build a look that follows you across Flexi.</p>
        </div>
        <div className="coin-balance">
          <Icon name="bolt" />
          <div>
            <b>{level}</b>
            <span>Current level</span>
          </div>
        </div>
      </header>
      <div className="dressing-room">
        <div className="shop-avatar">
          <FittedAvatar
            avatar={avatar.key}
            evolved={evolved}
            items={items}
            equipped={equipped}
            preview={preview}
          />
        </div>
        <div className="tryon-copy">
          <span className="eyebrow">LIVE TRY-ON</span>
          <h2>{preview?.name || 'Your current outfit'}</h2>
          <p>
            {preview?.description ||
              'Select any item below to preview it without changing your saved outfit.'}
          </p>
          {preview && (
            <div className="tryon-actions">
              <button className="secondary" onClick={() => setPreview(null)}>
                Clear preview
              </button>
              {owned.includes(preview.id) ? (
                <button
                  className="primary"
                  onClick={() => {
                    onEquip(preview)
                    setPreview(null)
                  }}
                >
                  Equip item
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={!preview.unlocked}
                  onClick={() => onPurchase(preview)}
                >
                  {preview.unlocked ? 'Claim & equip' : `Unlocks at level ${preview.minimumLevel}`}
                </button>
              )}
            </div>
          )}
          {message && <div className="shop-message">{message}</div>}
        </div>
      </div>
      <div className="shop-view-switch" role="group" aria-label="Shop view">
        <button
          className={view === 'shop' ? 'active' : ''}
          aria-pressed={view === 'shop'}
          onClick={() => setView('shop')}
        >
          Discover
        </button>
        <button
          className={view === 'closet' ? 'active' : ''}
          aria-pressed={view === 'closet'}
          onClick={() => setView('closet')}
        >
          My closet
        </button>
      </div>
      <div className="shop-filters">
        {(['all', 'clothing', 'accessories', 'backgrounds', 'special'] as const).map((item) => (
          <button
            key={item}
            className={category === item ? 'active' : ''}
            onClick={() => setCategory(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <div className="product-grid">
        {!visible.length && (
          <div className="empty-feed">
            {view === 'closet'
              ? 'No owned rewards in this category yet. Discover rewards to build your closet.'
              : 'No rewards in this category yet. Check back as the catalog grows.'}
          </div>
        )}
        {visible.map((item) => (
          <article className="product-card" key={item.id}>
            <div className="product-preview">
              <FittedAvatar avatar="bunny" evolved items={items} equipped={{}} preview={item} />
            </div>
            <div className="product-meta">
              <span className="acquisition free">
                {item.owned ? 'IN YOUR CLOSET' : 'LEVEL REWARD'}
              </span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <small>
                <Icon name={item.unlocked ? 'check' : 'lock'} />
                Level {item.minimumLevel}
              </small>
              <footer>
                <b>{item.owned ? 'Owned' : item.unlocked ? 'Ready to claim' : 'Locked'}</b>
                <div>
                  <button onClick={() => setPreview(item)}>Try on</button>
                  {owned.includes(item.id) && (
                    <button className="equip-quick" onClick={() => onEquip(item)}>
                      Equip
                    </button>
                  )}
                </div>
              </footer>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
