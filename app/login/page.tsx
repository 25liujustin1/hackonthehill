"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Map, Overlay } from "pigeon-maps";
import { createClient } from "@/lib/supabaseClient";

interface Capsule {
  id: string;
  title: string;
  lat: number;
  lng: number;
  created_at: string;
  approved: boolean;
}

interface Post {
  id: string;
  capsule_id: string;
  caption: string | null;
  media_path: string;
  author_id: string;
  visibility: "public" | "friends" | "private";
  created_at: string;
  media_url?: string;
}

interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  display_name?: string;
}

const UNLOCK_RADIUS_M = 30;
const UCLA_CENTER: [number, number] = [34.0689, -118.4452];
const FIXED_CAPSULES: Capsule[] = [
  {
    id: "fixed-bplate-capsule",
    title: "Bruin Plate (B-Plate) 🥗",
    lat: 34.0719,
    lng: -118.45,
    created_at: "",
    approved: true,
  },
];

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

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  color: "#fff",
  padding: "10px 12px",
  fontSize: 13,
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  background: "linear-gradient(135deg,#f59e0b,#ef4444)",
  border: "none",
  color: "#fff",
  fontWeight: 600,
  padding: "10px 18px",
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 13,
  width: "100%",
};

const ghostBtnStyle: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#aaa",
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 13,
  padding: "10px 0",
};

function VisibilitySelect({
  value,
  onChange,
}: {
  value: "public" | "friends" | "private";
  onChange: (v: "public" | "friends" | "private") => void;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as "public" | "friends" | "private")}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          color: "#fff",
          padding: "10px 12px",
          fontSize: 13,
          outline: "none",
          appearance: "none",
          cursor: "pointer",
        }}
      >
        <option value="public">🌐 Public — everyone can see</option>
        <option value="friends">👥 Friends only</option>
        <option value="private">🔒 Just me</option>
      </select>
    </div>
  );
}

export default function MapPage() {
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [center, setCenter] = useState<[number, number]>(UCLA_CENTER);
  const [zoom, setZoom] = useState(16);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [selectedCapsule, setSelectedCapsule] = useState<Capsule | null>(null);
  const [capsulePosts, setCapsulePosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [showDropPanel, setShowDropPanel] = useState(false);
  const [dropTitle, setDropTitle] = useState("");
  const [dropCaption, setDropCaption] = useState("");
  const [dropVisibility, setDropVisibility] = useState<"public" | "friends" | "private">("public");
  const [dropFile, setDropFile] = useState<File | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddPost, setShowAddPost] = useState(false);
  const [addCaption, setAddCaption] = useState("");
  const [addVisibility, setAddVisibility] = useState<"public" | "friends" | "private">("public");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addingPost, setAddingPost] = useState(false);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      (err) => console.warn("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("capsules")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("Capsule fetch error:", error.message);
          setCapsules(FIXED_CAPSULES);
          return;
        }
        setCapsules([...FIXED_CAPSULES, ...((data as Capsule[]) ?? [])]);
      });
  }, [user, supabase]);

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
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        queryParams: { hd: "g.ucla.edu" },
      },
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
      setAddFile(null);
      setAddCaption("");
      setExpandedPostId(null);
      setCapsulePosts([]);
      setLoadingPosts(true);

      const { data: posts, error } = await supabase
        .from("posts")
        .select("*")
        .eq("capsule_id", capsule.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Posts fetch error:", error.message);
        setLoadingPosts(false);
        return;
      }

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
        .insert({ title: dropTitle.trim(), lat: userPos[0], lng: userPos[1], author_id: user.id })
        .select()
        .single();

      if (capErr || !cap) {
        alert(`Capsule insert failed: ${capErr?.message ?? "Unknown error"}`);
        setDropping(false);
        return;
      }

      const ext = dropFile.name.split(".").pop();
      const path = `${user.id}/${cap.id}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("capsule-media").upload(path, dropFile);

      if (uploadErr) {
        alert(`Upload failed: ${uploadErr.message}`);
        setDropping(false);
        return;
      }

      await supabase.from("posts").insert({
        capsule_id: cap.id,
        caption: dropCaption.trim() || null,
        media_path: path,
        author_id: user.id,
        visibility: dropVisibility,
      });

      setCapsules((prev) => [cap as Capsule, ...prev]);
      setShowDropPanel(false);
      setDropTitle("");
      setDropCaption("");
      setDropFile(null);
      setDropVisibility("public");
    } catch (e: any) {
      alert(`Error: ${e?.message ?? JSON.stringify(e)}`);
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

      if (uploadErr) {
        alert(`Upload failed: ${uploadErr.message}`);
        setAddingPost(false);
        return;
      }

      const { data: post, error: postErr } = await supabase
        .from("posts")
        .insert({
          capsule_id: selectedCapsule.id,
          caption: addCaption.trim() || null,
          media_path: path,
          author_id: user.id,
          visibility: addVisibility,
        })
        .select()
        .single();

      if (postErr) { setAddingPost(false); return; }

      if (post) {
        const { data } = supabase.storage.from("capsule-media").getPublicUrl(path);
        setCapsulePosts((prev) => [{ ...(post as Post), media_url: data.publicUrl }, ...prev]);
      }

      setShowAddPost(false);
      setAddCaption("");
      setAddFile(null);
      setAddVisibility("public");
    } catch (e: any) {
      console.error(e);
    }
    setAddingPost(false);
  }

  async function handleDeleteCapsule(capsuleId: string) {
    if (!user || capsuleId === "fixed-bplate-capsule") return;
    if (!confirm("Delete this capsule and all its posts?")) return;
    const { error } = await supabase.from("capsules").delete().eq("id", capsuleId);
    if (error) { alert(`Delete failed: ${error.message}`); return; }
    setCapsules((prev) => prev.filter((c) => c.id !== capsuleId));
    setSelectedCapsule(null);
  }

  async function loadComments(postId: string) {
    if (comments[postId]) {
      setExpandedPostId((prev) => (prev === postId ? null : postId));
      return;
    }
    const { data, error } = await supabase
      .from("comments")
      .select("*, profiles(display_name)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      const shaped: Comment[] = data.map((c: any) => ({
        ...c,
        display_name: c.profiles?.display_name ?? "unknown",
      }));
      setComments((prev) => ({ ...prev, [postId]: shaped }));
    }
    setExpandedPostId(postId);
  }

  async function handlePostComment(postId: string) {
    if (!user || !commentBody.trim()) return;
    setPostingComment(true);
    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: postId, author_id: user.id, body: commentBody.trim() })
      .select("*, profiles(display_name)")
      .single();

    if (!error && data) {
      const newComment: Comment = { ...data, display_name: (data as any).profiles?.display_name ?? "you" };
      setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), newComment] }));
      setCommentBody("");
    }
    setPostingComment(false);
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
        input::placeholder { color: #555; }
        select option { background: #111; }
      `}</style>

      <Map
        center={center}
        zoom={zoom}
        onBoundsChanged={({ center, zoom }) => { setCenter(center); setZoom(zoom); }}
        onClick={({ event }) => {
          const target = event.target as HTMLElement;
          if (target.tagName === "CANVAS" || (typeof target.className === "string" && target.className.includes("pigeon-click-block"))) {
            setSelectedCapsule(null);
            setShowDropPanel(false);
          }
        }}
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
          const dist = userPos ? Math.round(haversineMeters(userPos[0], userPos[1], cap.lat, cap.lng)) : null;
          return (
            <Overlay key={cap.id} anchor={[cap.lat, cap.lng]} offset={[16, 32]}>
              <div
                className="capsule-btn"
                onClick={(e) => { e.stopPropagation(); openCapsule(cap); }}
                style={{ cursor: unlocked ? "pointer" : "default", userSelect: "none", display: "flex", flexDirection: "column", alignItems: "center" }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)",
                  background: unlocked ? "linear-gradient(135deg,#f59e0b,#ef4444)" : "#3a3a3a",
                  border: `2px solid ${unlocked ? "#fcd34d" : "#555"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: unlocked ? "0 0 12px rgba(245,158,11,0.5)" : "none",
                }}>
                  <span style={{ transform: "rotate(45deg)", fontSize: 14 }}>{unlocked ? "📦" : "🔒"}</span>
                </div>
                <div style={{
                  marginTop: 6, background: "rgba(10,10,10,0.9)", color: "#fff",
                  padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{cap.title}</span>
                  {dist !== null && (
                    <>
                      <span style={{ fontSize: 10, color: unlocked ? "#4ade80" : "#fbbf24" }}>{dist}m away</span>
                      {!unlocked && <span style={{ fontSize: 9, color: "#666", fontStyle: "italic" }}>Reach 30m to unlock</span>}
                    </>
                  )}
                </div>
              </div>
            </Overlay>
          );
        })}
      </Map>

      {/* Header */}
      <div style={{
        position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(10,10,10,0.85)", backdropFilter: "blur(12px)",
        padding: "10px 18px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)",
        zIndex: 100, whiteSpace: "nowrap"
      }}>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", color: "#fff", fontWeight: 700, fontSize: 15 }}>📍 TimeCapsule</span>
        {user ? (
          <>
            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} />
            <span style={{ color: "#aaa", fontSize: 12 }}>{user.email?.split("@")[0]}</span>
            <button onClick={signOut} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 11, padding: "4px 10px", borderRadius: 999, cursor: "pointer" }}>Sign out</button>
          </>
        ) : (
          <button onClick={() => setShowAuthModal(true)} style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)", border: "none", color: "#fff", fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 999, cursor: "pointer" }}>Login with UCLA</button>
        )}
      </div>

      {/* FAB */}
      {user && userPos && (
        <button className="capsule-btn" onClick={(e) => { e.stopPropagation(); setShowDropPanel(true); setSelectedCapsule(null); }}
          style={{ position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#f59e0b,#ef4444)", border: "none", color: "#fff", fontSize: 24, cursor: "pointer", boxShadow: "0 4px 24px rgba(245,158,11,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          +
        </button>
      )}

      {/* Drop Panel */}
      {showDropPanel && (
        <div className="panel" style={{ position: "absolute", bottom: 100, right: 24, left: 24, maxWidth: 380, margin: "0 auto", background: "rgba(15,15,15,0.95)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 20, zIndex: 200, color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15 }}>Drop a Capsule 📦</span>
            <button onClick={() => setShowDropPanel(false)} style={{ background: "none", border: "none", color: "#666", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>
          <input placeholder="Capsule title (e.g. Powell Library)" value={dropTitle} onChange={(e) => setDropTitle(e.target.value)} style={inputStyle} />
          <input placeholder="Caption (optional)" value={dropCaption} onChange={(e) => setDropCaption(e.target.value)} style={{ ...inputStyle, marginTop: 10 }} />
          <VisibilitySelect value={dropVisibility} onChange={setDropVisibility} />
          <div onClick={() => fileInputRef.current?.click()} style={{ marginTop: 10, border: "1.5px dashed rgba(255,255,255,0.2)", borderRadius: 10, padding: "14px", textAlign: "center", cursor: "pointer", color: "#777", fontSize: 13, background: dropFile ? "rgba(245,158,11,0.06)" : "transparent" }}>
            {dropFile ? `📎 ${dropFile.name}` : "Tap to attach a photo"}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setDropFile(e.target.files?.[0] ?? null)} />
          <button onClick={handleDrop} disabled={dropping || !dropTitle.trim() || !dropFile} style={{ ...btnStyle, marginTop: 14, opacity: !dropTitle.trim() || !dropFile || dropping ? 0.4 : 1 }}>
            {dropping ? "Dropping..." : "Drop it here 📍"}
          </button>
        </div>
      )}

      {/* Capsule Panel */}
      {selectedCapsule && (
        <div className="panel" style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "60vh", background: "rgba(12,12,12,0.97)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.08)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 20px 32px", zIndex: 200, color: "#fff", overflowY: "auto" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#333", margin: "0 auto 16px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700 }}>{selectedCapsule.title}</h2>
              <p style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{selectedCapsule.created_at ? new Date(selectedCapsule.created_at).toLocaleDateString() : ""}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAddPost((v) => !v)} style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b", padding: "6px 12px", borderRadius: 10, fontSize: 12, cursor: "pointer" }}>+ Post</button>
              {selectedCapsule.id !== "fixed-bplate-capsule" && (
                <button onClick={() => handleDeleteCapsule(selectedCapsule.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", padding: "6px 12px", borderRadius: 10, fontSize: 12, cursor: "pointer" }}>🗑️</button>
              )}
              <button onClick={() => setSelectedCapsule(null)} style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
          </div>

          {showAddPost && (
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid rgba(255,255,255,0.07)" }}>
              <input placeholder="Caption (optional)" value={addCaption} onChange={(e) => setAddCaption(e.target.value)} style={inputStyle} />
              <VisibilitySelect value={addVisibility} onChange={setAddVisibility} />
              <div onClick={() => addFileInputRef.current?.click()} style={{ marginTop: 10, border: "1.5px dashed rgba(255,255,255,0.15)", borderRadius: 10, padding: "12px", textAlign: "center", cursor: "pointer", color: "#666", fontSize: 12, background: addFile ? "rgba(245,158,11,0.05)" : "transparent" }}>
                {addFile ? `📎 ${addFile.name}` : "Attach photo"}
              </div>
              <input ref={addFileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setAddFile(e.target.files?.[0] ?? null)} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={handleAddPost} disabled={addingPost || !addFile} style={{ ...btnStyle, flex: 1, opacity: !addFile || addingPost ? 0.4 : 1 }}>{addingPost ? "Posting..." : "Post"}</button>
                <button onClick={() => setShowAddPost(false)} style={ghostBtnStyle}>Cancel</button>
              </div>
            </div>
          )}

          {loadingPosts ? (
            <div style={{ textAlign: "center", color: "#555", padding: "24px 0" }}>Loading memories...</div>
          ) : capsulePosts.length === 0 ? (
            <div style={{ textAlign: "center", color: "#444", padding: "24px 0" }}>No posts yet. Be the first!</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {capsulePosts.map((post) => (
                <div key={post.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
                  {post.media_url && (
                    <img src={post.media_url} alt={post.caption ?? ""} style={{ width: "100%", maxHeight: 260, objectFit: "cover", display: "block" }} />
                  )}
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <p style={{ fontSize: 11, color: "#555" }}>
                        🕰 {new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {new Date(post.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </p>
                      <span style={{ fontSize: 9, color: "#444", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>{post.visibility}</span>
                    </div>
                    {post.caption && <p style={{ fontSize: 13, color: "#ccc", lineHeight: 1.5, marginBottom: 10 }}>{post.caption}</p>}
                    <button onClick={() => loadComments(post.id)} style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", padding: 0 }}>
                      {expandedPostId === post.id ? "▲ Hide" : "💬 Comments"}
                    </button>
                    {expandedPostId === post.id && (
                      <div style={{ marginTop: 10 }}>
                        {(comments[post.id] ?? []).length === 0 ? (
                          <p style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>No comments yet.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                            {(comments[post.id] ?? []).map((c) => (
                              <div key={c.id} style={{ fontSize: 12, color: "#bbb", lineHeight: 1.4 }}>
                                <span style={{ color: "#f59e0b", fontWeight: 600 }}>{c.display_name}</span> {c.body}
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            placeholder="Add a comment…"
                            value={commentBody}
                            onChange={(e) => setCommentBody(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handlePostComment(post.id); }}
                            style={{ ...inputStyle, fontSize: 12 }}
                          />
                          <button onClick={() => handlePostComment(post.id)} disabled={postingComment || !commentBody.trim()}
                            style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)", border: "none", color: "#fff", borderRadius: 8, padding: "0 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: postingComment || !commentBody.trim() ? 0.4 : 1 }}>
                            →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div onClick={() => setShowAuthModal(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="panel" onClick={(e) => e.stopPropagation()} style={{ background: "rgba(15,15,15,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, maxWidth: 320, width: "90%", textAlign: "center", color: "#fff" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Digital Time Capsule</h2>
            <p style={{ color: "#666", fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>Leave photos and messages at real UCLA locations. Only accessible when you're physically nearby.</p>
            <button onClick={signIn} style={{ ...btnStyle, padding: "12px 0", fontSize: 14 }}>Login with UCLA Google</button>
          </div>
        </div>
      )}

      {/* Location warning */}
      {user && !userPos && (
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "rgba(15,15,15,0.9)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,165,0,0.3)", color: "#f59e0b", fontSize: 12, padding: "8px 16px", borderRadius: 999, zIndex: 100, whiteSpace: "nowrap" }}>
          ⚠️ Enable location to unlock capsules
        </div>
      )}
    </div>
  );
}