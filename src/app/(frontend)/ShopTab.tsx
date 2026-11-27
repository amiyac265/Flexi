'use client'

import { useState } from 'react'
import { Icon, FittedAvatar, type ShopItem, type Equipped } from './FlexiVisuals'
import './shop.css'

export default function ShopTab({
  avatar,
  evolved,
  items,
  owned,
  equipped,
  level,
  balance,
  busy,
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
  balance: number | null
  busy: boolean
  message: string
  onPurchase: (item: ShopItem) => void
  onEquip: (item: ShopItem) => void
}) {
  const [view, setView] = useState<'shop' | 'closet'>('shop')
  const [category, setCategory] = useState<'all' | ShopItem['category']>('all')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const preview = items.find((item) => item.id === previewId)
  const affordable =
    preview && (preview.coinPrice === 0 || (balance !== null && balance >= preview.coinPrice))
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
            <b>{balance === null ? 'Balance unavailable' : `${balance} coins`}</b>
            <span>Level {level}</span>
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
              <button className="secondary" onClick={() => setPreviewId(null)}>
                Clear preview
              </button>
              {owned.includes(preview.id) ? (
                <button
                  className="primary"
                  onClick={() => {
                    onEquip(preview)
                    setPreviewId(null)
                  }}
                >
                  Equip item
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={busy || !preview.unlocked || !affordable}
                  onClick={() => onPurchase(preview)}
                >
                  {!preview.unlocked
                    ? `Unlocks at level ${preview.minimumLevel}`
                    : preview.coinPrice === 0
                      ? 'Claim & equip'
                      : `Buy & equip for ${preview.coinPrice} coins`}
                </button>
              )}
            </div>
          )}
          {preview && preview.unlocked && !preview.owned && !affordable && (
            <p>
              {balance === null
                ? 'Refresh to check your balance.'
                : `Earn ${preview.coinPrice - balance} more coins to buy this item.`}
            </p>
          )}
          {message && (
            <div className="shop-message" role="status">
              {message}
            </div>
          )}
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
                {item.owned ? 'IN YOUR CLOSET' : item.coinPrice ? 'COIN SHOP' : 'LEVEL REWARD'}
              </span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <small>
                <Icon name={item.unlocked ? 'check' : 'lock'} />
                Level {item.minimumLevel}
              </small>
              <footer>
                <b>{item.owned ? 'Owned' : item.coinPrice ? `${item.coinPrice} coins` : 'Free'}</b>
                <div>
                  <button onClick={() => setPreviewId(item.id)}>Try on</button>
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
