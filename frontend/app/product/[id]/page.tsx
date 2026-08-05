"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { gifts } from "../../../lib/gifts";
import { accountStorageKey, getStoredUser } from "../../../lib/storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const gift = gifts.find((item) => item.id === params.id) || gifts[0];
  const [activeImage, setActiveImage] = useState(0);
  const [isSelected, setIsSelected] = useState(false);

  useEffect(() => {
    setIsSelected(window.localStorage.getItem(accountStorageKey("selected_gift")) === gift.id);
  }, [gift.id]);

  async function chooseGift() {
    window.localStorage.setItem(accountStorageKey("selected_gift"), gift.id);
    setIsSelected(true);
    const user = getStoredUser();
    if (user?.id) {
      try {
        await fetch(`${API_URL}/api/saved-gifts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: user.id, gift_id: gift.id }) });
      } catch {
        // Keep the local selection when the database is temporarily unavailable.
      }
    }
  }

  return (
    <main className="product-page">
      <nav className="product-nav"><a className="wordmark" href="/dashboard">CHARIS<span>.</span></a><a className="consultation-exit" href="/recommendations">← Back to recommendations</a></nav>
      <div className="product-layout"><section className="product-gallery"><div className="product-main-image"><img src={gift.gallery[activeImage]} alt={`${gift.name} gallery image ${activeImage + 1}`} /></div><div className="product-thumbnails">{gift.gallery.map((image, index) => <button className={activeImage === index ? "active" : ""} key={image} onClick={() => setActiveImage(index)}><img src={image} alt={`${gift.name} thumbnail ${index + 1}`} /></button>)}</div></section><section className="product-copy"><p className="eyebrow wine-text">{gift.category}</p><h1>{gift.name}</h1><div className="product-price">{gift.price}</div><p className="product-description">{gift.description}</p><button className="product-choose" onClick={chooseGift}>{isSelected ? "Added to your cart" : "Add to your cart"}<span>{isSelected ? "✓" : "↗"}</span></button><a className="message-link" href={`/gift-message?gift=${gift.id}`}>Write a gift message <span>↗</span></a><div className="product-facts"><div><span>THE STORY</span><p>{gift.story}</p></div><div><span>SYMBOLIC MEANING</span><p>{gift.meaning}</p></div><div><span>DELIVERY</span><p>{gift.delivery}</p></div></div></section></div>
    </main>
  );
}
