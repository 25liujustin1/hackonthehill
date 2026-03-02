"use client";

import { useState, useEffect, useRef } from "react";
import { Map, Marker, Overlay } from "pigeon-maps";
import { createClient } from "@/lib/supabaseClient";

interface Capsule {
  id: string;
  title: string;
  lat: number;
  lng: number;
  created_at: string;
}

interface Post {
  id: string;
  capsule_id: string;
  caption: string | null;
  media_path: string;
  author_id: string;
  created_at: string;
  media_url?: string;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const UNLOCK_RADIUS_M = 30;

export default function MapPage() {
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [center, setCenter] = useState<[number, number]>([34.0689, -118.4452]);
  const [zoom, setZoom] = useState(16);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [selectedCapsule, setSelectedCapsule] = useState<Capsule | null>(null);
  const [capsulePosts, setCapsulePosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [showDropPanel, setShowDropPanel] = useState(false);
  const [dropTitle, setDropTitle] = useState("");
  const [dropCaption, setDropCaption] = useState("");
  const [dropFile, setDropFile] = useState<File | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddPost, setShowAddPost] = useState(false);
  const [addCaption, setAddCaption] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addingPost, setAddingPost] = useState(false);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // 1. AUTH LOGIC
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // 2. HIGH-PERFORMANCE GEOLOCATION (Fixes Blue Marker & Re-center)
  useEffect(() => {
    if (!navigator.geolocation) return;

    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 2000
    };

    const updateLocation = (pos: GeolocationPosition) => {
      setUserPos([pos.coords.latitude, pos.coords.longitude]);
    };

    const id = navigator.geolocation.watchPosition(updateLocation, () => {}, geoOptions);

    const heartbeatId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(updateLocation, null, geoOptions);
    }, 3000);

    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(heartbeatId);
    };
  }, []);

  // 3. CAPSULE FETCHING + B-PLATE INJECTION
  useEffect(() => {
    if (!user) return;
    
    supabase
      .from("capsules")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const bPlate: Capsule = { 
          id: 'fixed-bplate-capsule', 
          title: "Bruin Plate (B-Plate) 🥗", 
          lat: 34.0719, 
          lng: -118.4500, 
          created_at: new Date().toISOString() 
        };

        if (data) setCapsules([bPlate, ...data]);
        else setCapsules([bPlate]);
      });
  }, [user]);

  function isUnlocked(capsule: Capsule): boolean {
    if (!userPos) return false;
    return haversineMeters(userPos[0], userPos[1], capsule.lat, capsule.lng) <= UNLOCK_RADIUS_M;
  }

  function requireAuth(cb: () => void) {
    if (!user) { setShowAuthModal(true); return; }
    cb();
  }

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setCapsules([]);
    setSelectedCapsule(null);
  }

  async function openCapsule(capsule: Capsule) {
    requireAuth(async () => {
      if (!isUnlocked(capsule)) return;
      setSelectedCapsule(capsule);
      setShowAddPost(false);
      setCapsulePosts([]);
      setLoadingPosts(true);
      const { data: posts } = await supabase
        .from("posts")
        .select("*")
        .eq("capsule_id", capsule.id)
        .order("created_at", { ascending: false });
      if (posts) {
        const withUrls = await Promise.all(
          (posts as Post[]).map(async (p) => {
            const { data } = supabase.storage.from("capsule-media").getPublicUrl(p.media_path);
            return { ...p, media_url: data.publicUrl };
          })
        );
        setCapsulePosts(withUrls);
      }
      setLoadingPosts(false);
    });
  }

  async function handleDrop() {
    if (!user || !userPos || !dropFile || !dropTitle.trim()) return;
    setDropping(true);
    try {
      const { data: cap, error: capErr } = await supabase
        .from("capsules")
        .insert({ title: dropTitle.trim(), lat: userPos[0], lng: userPos[1] })
        .select()
        .single();
      if (capErr || !cap) throw capErr;
      const ext = dropFile.name.split(".").pop();
      const path = `${user.id}/${cap.id}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("capsule-media").upload(path, dropFile);
      if (uploadErr) throw uploadErr;
      await supabase.from("posts").insert({
        capsule_id: cap.id,
        caption: dropCaption.trim() || null,
        media_path: path,
        author_id: user.id,
      });
      setCapsules((prev) => [cap as Capsule, ...prev]);
      setShowDropPanel(false);
      setDropTitle("");
      setDropCaption("");
      setDropFile(null);
    } catch (e) {
      console.error(e);
      alert("Something went wrong. Check console.");
    }
    setDropping(false);
  }

  async function handleAddPost() {
    if (!user || !selectedCapsule || !addFile) return;
    setAddingPost(true);
    try {
      const ext = addFile.name.split(".").pop();
      const path = `${user.id}/${selectedCapsule.id}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("capsule-media").upload(path, addFile);
      if (uploadErr) throw uploadErr;
      const { data: post } = await supabase
        .from("posts")
        .insert({
          capsule_id: selectedCapsule.id,
          caption: addCaption.trim() || null,
          media_path: path,
          author_id: user.id,
        })
        .select()
        .single();
      if (post) {
        const { data } = supabase.storage.from("capsule-media").getPublicUrl(path);
        setCapsulePosts((prev) => [{ ...(post as Post), media_url: data.publicUrl }, ...prev]);
      }
      setShowAddPost(false);
      setAddCaption("");
      setAddFile(null);
    } catch (e) {
      console.error(e);
      alert("Something went wrong.");
    }
    setAddingPost(false);
  }

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", fontFamily: "'DM Sans', sans-serif", background: "#0a0a0a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        .capsule-btn { transition: all 0.15s ease; }
        .capsule-btn:hover { transform: scale(1.05); }
        .capsule-btn:active { transform: scale(0.97); }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes ping { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.4);opacity:0} }
        .ping { animation: ping 1.8s ease-in-out infinite; }
        .panel { animation: fadeUp 0.2s ease; }
      `}</style>

      <Map
        center={center}
        zoom={zoom}
        onBoundsChanged={({ center, zoom }) => { setCenter(center); setZoom(zoom); }}
        onClick={() => { setSelectedCapsule(null); setShowDropPanel(false); }}
      >
        {userPos && (
          <Overlay anchor={userPos} offset={[10, 10]}>
            <div style={{ position: "relative", width: 20, height: 20 }}>
              <div className="ping" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(59,130,246,0.4)" }} />
              <div style={{ position: "absolute", inset: 3, borderRadius: "50%", background: "#3b82f6", border: "2px solid white" }} />
            </div>
          </Overlay>
        )}

        {capsules.map((cap) => {
          const unlocked = isUnlocked(cap);
          return (
            <Overlay key={cap.id} anchor={[cap.lat, cap.lng]} offset={[16, 32]}>
              <div
                className="capsule-btn"
                onClick={(e) => { e.stopPropagation(); openCapsule(cap); }}
                style={{ cursor: unlocked ? "pointer" : "default", userSelect: "none" }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: "50% 50% 50% 0",
                  transform: "rotate(-45deg)",
                  background: unlocked ? "linear-gradient(135deg,#f59e0b,#ef4444)" : "#3a3a3a",
                  border: `2px solid ${unlocked ? "#fcd34d" : "#555"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: unlocked ? "0 0 12px rgba(245,158,11,0.5)" : "none",
                  transition: "all 0.3s ease"
                }}>
                  <span style={{ transform: "rotate(45deg)", fontSize: 14 }}>
                    {unlocked ? "📦" : "🔒"}
                  </span>
                </div>
                <div style={{
                  marginTop: 4, background: "rgba(0,0,0,0.75)", color: "#fff",
                  fontSize: 10, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap",
                  backdropFilter: "blur(4px)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis"
                }}>
                  {cap.title}
                </div>
              </div>
            </Overlay>
          );
        })}
      </Map>

      <div style={{
        position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(10,10,10,0.85)", backdropFilter: "blur(12px)",
        padding: "10px 18px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)",
        zIndex: 100
      }}>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: "-0.3px" }}>
          📍 TimeCapsule
        </span>
        {user ? (
          <>
            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} />
            <span style={{ color: "#aaa", fontSize: 12 }}>{user.email?.split("@")[0]}</span>
            <button onClick={signOut} style={{
              background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc",
              fontSize: 11, padding: "4px 10px", borderRadius: 999, cursor: "pointer"
            }}>Sign out</button>
          </>
        ) : (
          <button onClick={() => setShowAuthModal(true)} style={{
            background: "linear-gradient(135deg,#f59e0b,#ef4444)", border: "none",
            color: "#fff", fontSize: 12, fontWeight: 600, padding: "5px 14px",
            borderRadius: 999, cursor: "pointer"
          }}>Login with UCLA</button>
        )}
      </div>

      {user && userPos && (
        <button
          className="capsule-btn"
          onClick={() => { setShowDropPanel(true); setSelectedCapsule(null); }}
          style={{
            position: "absolute", bottom: 32, right: 24,
            width: 56, height: 56, borderRadius: "50%",
            background: "linear-gradient(135deg,#f59e0b,#ef4444)",
            border: "none", color: "#fff", fontSize: 24, cursor: "pointer",
            boxShadow: "0 4px 24px rgba(245,158,11,0.4)",
            zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center"
          }}
        >+</button>
      )}

      {userPos && (
        <button
          className="capsule-btn"
          onClick={() => setCenter(userPos)}
          style={{
            position: "absolute", bottom: 100, right: 24,
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(10,10,10,0.85)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.12)", color: "#3b82f6",
            fontSize: 18, cursor: "pointer", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
        >◎</button>
      )}

      {showDropPanel && (
        <div className="panel" style={{
          position: "absolute", bottom: 100, right: 24, left: 24,
          maxWidth: 380, margin: "0 auto",
          background: "rgba(15,15,15,0.95)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
          padding: 20, zIndex: 200, color: "#fff"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15 }}>Drop a Capsule 📦</span>
            <button onClick={() => setShowDropPanel(false)} style={{ background: "none", border: "none", color: "#666", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>
          <input placeholder="Capsule title (e.g. Powell Library)" value={dropTitle} onChange={(e) => setDropTitle(e.target.value)} style={inputStyle} />
          <input placeholder="Caption (optional)" value={dropCaption} onChange={(e) => setDropCaption(e.target.value)} style={{ ...inputStyle, marginTop: 10 }} />
          <div onClick={() => fileInputRef.current?.click()} style={{
            marginTop: 10, border: "1.5px dashed rgba(255,255,255,0.2)",
            borderRadius: 10, padding: "14px", textAlign: "center",
            cursor: "pointer", color: "#777", fontSize: 13,
            background: dropFile ? "rgba(245,158,11,0.06)" : "transparent"
          }}>
            {dropFile ? `📎 ${dropFile.name}` : "Tap to attach a photo"}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={(e) => setDropFile(e.target.files?.[0] ?? null)} />
          <button onClick={handleDrop} disabled={dropping || !dropTitle.trim() || !dropFile} style={{ ...btnStyle, marginTop: 14, opacity: (!dropTitle.trim() || !dropFile || dropping) ? 0.4 : 1 }}>
            {dropping ? "Dropping..." : "Drop it here 📍"}
          </button>
        </div>
      )}

      {selectedCapsule && (
        <div className="panel" style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          maxHeight: "55vh",
          background: "rgba(12,12,12,0.97)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)", borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: "20px 20px 32px", zIndex: 200, color: "#fff", overflowY: "auto"
        }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#333", margin: "0 auto 16px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700 }}>{selectedCapsule.title}</h2>
              <p style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                {new Date(selectedCapsule.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAddPost(!showAddPost)} style={{ ...btnStyle, padding: "6px 14px", fontSize: 12 }}>+ Add photo</button>
              <button onClick={() => setSelectedCapsule(null)} style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
          </div>

          {showAddPost && (
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid rgba(255,255,255,0.07)" }}>
              <input placeholder="Caption (optional)" value={addCaption} onChange={(e) => setAddCaption(e.target.value)} style={inputStyle} />
              <div onClick={() => addFileInputRef.current?.click()} style={{
                marginTop: 10, border: "1.5px dashed rgba(255,255,255,0.15)",
                borderRadius: 10, padding: "12px", textAlign: "center",
                cursor: "pointer", color: "#666", fontSize: 12,
                background: addFile ? "rgba(245,158,11,0.05)" : "transparent"
              }}>
                {addFile ? `📎 ${addFile.name}` : "Attach photo"}
              </div>
              <input ref={addFileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setAddFile(e.target.files?.[0] ?? null)} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={handleAddPost} disabled={addingPost || !addFile} style={{ ...btnStyle, flex: 1, opacity: (!addFile || addingPost) ? 0.4 : 1 }}>
                  {addingPost ? "Posting..." : "Post"}
                </button>
                <button onClick={() => setShowAddPost(false)} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa", borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loadingPosts ? (
            <div style={{ textAlign: "center", color: "#555", padding: "24px 0", fontSize: 13 }}>Loading memories...</div>
          ) : capsulePosts.length === 0 ? (
            <div style={{ textAlign: "center", color: "#444", padding: "24px 0", fontSize: 13 }}>No posts yet. Be the first to leave a memory here 🌟</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
              {capsulePosts.map((post) => (
                <div key={post.id} style={{ borderRadius: 10, overflow: "hidden", position: "relative", aspectRatio: "1", background: "#1a1a1a" }}>
                  {post.media_url && <img src={post.media_url} alt={post.caption ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  {post.caption && (
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,0.75))", padding: "16px 8px 6px", fontSize: 10, color: "#fff" }}>
                      {post.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAuthModal && (
        <div onClick={() => setShowAuthModal(false)} style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)", zIndex: 300,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div className="panel" onClick={(e) => e.stopPropagation()} style={{
            background: "rgba(15,15,15,0.98)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20, padding: 32, maxWidth: 320, width: "90%", textAlign: "center", color: "#fff"
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Digital Time Capsule</h2>
            <p style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
              Leave photos and messages at real UCLA locations. Unlock capsules when you're nearby.
            </p>
            <button onClick={signIn} style={{ ...btnStyle, width: "100%", padding: "12px 0", fontSize: 14 }}>Login with UCLA Google</button>
            <button onClick={() => setShowAuthModal(false)} style={{ marginTop: 10, background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer" }}>Maybe later</button>
          </div>
        </div>
      )}

      {user && !userPos && (
        <div style={{
          position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "rgba(15,15,15,0.9)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,165,0,0.3)", color: "#f59e0b",
          fontSize: 12, padding: "8px 16px", borderRadius: 999, zIndex: 100, whiteSpace: "nowrap"
        }}>
          ⚠️ Enable location to unlock capsules
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
  color: "#fff", padding: "10px 12px", fontSize: 13, outline: "none"
};

const btnStyle: React.CSSProperties = {
  background: "linear-gradient(135deg,#f59e0b,#ef4444)",
  border: "none", color: "#fff", fontWeight: 600,
  padding: "10px 18px", borderRadius: 10,
  cursor: "pointer", fontSize: 13, width: "100%"
};