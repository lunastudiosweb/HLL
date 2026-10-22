/* HLL — Hardest Levels List | Main JavaScript */
"use strict";

const SUPABASE_URL = "https://ldtnptrhnpulvjwdtzwa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WXmIU22zRyh_MYtS1jFOJw_b8N9VVYo";

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let authListenerRegistered = false;

const $ = id => document.getElementById(id);
const pageName = () => location.pathname.split("/").pop() || "index.html";
const getQueryParameter = name => new URLSearchParams(location.search).get(name);

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}
function showMessage(el, message, type = "info") {
    if (!el) return;
    el.textContent = message;
    el.dataset.type = type;
    el.hidden = false;
}
function hideMessage(el) {
    if (el) { el.hidden = true; el.textContent = ""; }
}
function showEmptyState(el, title, description) {
    if (!el) return;
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    const h = document.createElement("h3");
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = description;
    wrap.append(h, p);
    el.replaceChildren(wrap);
}
function getErrorMessage(error) {
    return error?.message || "Something went wrong. Please try again.";
}
function formatDate(value) {
    if (!value) return "Unknown date";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric"
    });
}
function setLoading(button, loading, fallback = "Submit") {
    if (!button) return;
    if (loading) {
        if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Please wait...";
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || fallback;
        delete button.dataset.originalText;
    }
}
function safeNextUrl(next) {
    if (!next) return "index.html";
    if (next.startsWith("/") && !next.startsWith("//")) return next;
    if (!next.includes(":") && !next.startsWith("//")) return next;
    return "index.html";
}

/* Supabase setup */
function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
        if (window.supabase?.createClient) return resolve();
        const existing = document.querySelector('script[data-hll-supabase="true"]');
        if (existing) {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", () => reject(new Error("Could not load Supabase.")), { once: true });
            return;
        }
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
        script.dataset.hllSupabase = "true";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Supabase could not load. Check your connection."));
        document.head.appendChild(script);
    });
}
async function initializeSupabase() {
    await loadSupabaseLibrary();
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase configuration is incomplete.");
    if (!supabaseClient) supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    return supabaseClient;
}
async function loadCurrentUser() {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) { currentUser = null; currentProfile = null; return null; }
    currentUser = data.user || null;
    if (currentUser) await ensureProfile();
    else currentProfile = null;
    return currentUser;
}
async function ensureProfile() {
    if (!currentUser) return null;
    const { data, error } = await supabaseClient.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (error) { console.error("Profile lookup failed:", error.message); return null; }
    if (data) { currentProfile = data; return data; }

    const meta = currentUser.user_metadata || {};
    const raw = meta.username || currentUser.email?.split("@")[0] || "player";
    const username = String(raw).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "player";
    const { data: created, error: insertError } = await supabaseClient.from("profiles")
        .insert({ id: currentUser.id, username, bio: "", gd_username: "" }).select().single();
    if (!insertError) { currentProfile = created; return created; }

    // A parallel tab/signup flow may have inserted the row already.
    const retry = await supabaseClient.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (retry.data) { currentProfile = retry.data; return retry.data; }
    console.warn("Could not create profile:", insertError.message);
    return null;
}
async function requireLogin() {
    const user = await loadCurrentUser();
    if (!user) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `login.html?next=${next}`;
        return null;
    }
    return user;
}
async function logout() {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) { alert("Could not log out: " + getErrorMessage(error)); return; }
    currentUser = null;
    currentProfile = null;
    location.href = "index.html";
}
function updateLoginButton() {
    const button = document.querySelector(".login-button");
    if (!button) return;
    button.textContent = currentUser ? "My Account" : "Log In";
    button.href = currentUser ? `profile.html?id=${encodeURIComponent(currentUser.id)}` : "login.html";
}
function updateProfileSubmitButton() {
    const button = $("profile-submit-button") || document.querySelector(".submit-section .button");
    if (!button) return;
    button.textContent = currentUser ? "Submit a Completion" : "Sign In to HLL";
    button.href = currentUser ? "completion.html" : `login.html?next=${
       /* Approved lists. Requires levels.status = 'approved' and rank/list_type columns. */
async function getApprovedLevels(listType = null) {
    let query = supabaseClient.from("levels")
        .select("id, name, level_id, creator, list_type, rank, description")
        .eq("status", "approved").order("rank", { ascending: true });
    if (listType) query = query.eq("list_type", listType);
    const { data, error } = await query;
    if (error) {
        console.error("Level loading failed:", error.message);
        showEmptyState($("ranking-list"), "Could not load levels", "Please refresh. If the problem continues, check the levels schema and Supabase read policies.");
        return null;
    }
    return data || [];
}
async function renderLevelList(listType) {
    const list = $("ranking-list"), count = $("list-count"), search = $("level-search");
    if (!list) return;
    showEmptyState(list, "Loading levels...", "Fetching approved rankings from HLL.");
    const levels = await getApprovedLevels(listType);
    if (levels === null) { if (count) count.textContent = "Rankings could not be loaded."; return; }

    function render(items) {
        if (count) count.textContent = `${items.length} level${items.length === 1 ? "" : "s"}`;
        if (!items.length) { showEmptyState(list, "No levels found", "Approved levels for this list will appear here when added."); return; }
        list.innerHTML = items.map(level => `
            <a class="ranking-item" href="level.html?id=${encodeURIComponent(level.id)}">
                <span class="ranking-position">#${escapeHTML(level.rank ?? "—")}</span>
                <span class="ranking-details">
                    <strong>${escapeHTML(level.name || "Unnamed level")}</strong>
                    <span>${escapeHTML(level.creator || "Unknown creator")}</span>
                </span>
                <span class="ranking-arrow" aria-hidden="true">›</span>
            </a>`).join("");
    }
    render(levels);
    if (search && search.dataset.hllBound !== "true") {
        search.dataset.hllBound = "true";
        search.addEventListener("input", () => {
            const term = search.value.trim().toLowerCase();
            render(levels.filter(level =>
                String(level.name || "").toLowerCase().includes(term) ||
                String(level.creator || "").toLowerCase().includes(term) ||
                String(level.rank ?? "").includes(term) ||
                String(level.level_id || "").toLowerCase().includes(term)
            ));
        });
    }
}

/* Players */
async function renderPlayersList() {
    const list = $("player-list"), count = $("player-count"), search = $("player-search");
    if (!list) return;
    showEmptyState(list, "Loading players...", "Fetching HLL player profiles.");
    const { data: profiles, error } = await supabaseClient.from("profiles")
        .select("id, username, gd_username, bio").order("username", { ascending: true });
    if (error) { console.error(error.message); show

   /* Player profile */
async function renderProfile() {
    const heading = $("profile-heading"), description = $("profile-description");
    const actions = $("profile-actions"), rank = $("profile-rank"), points = $("profile-points");
    const completionsCount = $("profile-completions"), completionList = $("profile-completion-list");
    if (!heading) return;
    const profileId = getQueryParameter("id") || currentUser?.id;
    if (!profileId) {
        heading.textContent = "Player not found";
        if (description) description.textContent = "Log in or select a player profile.";
        if (actions) actions.innerHTML = '<a class="button button-primary" href="login.html">Sign In</a><a class="button button-secondary" href="players.html">Player Leaderboard</a>';
        return;
    }
    const { data: profile, error } = await supabaseClient.from("profiles")
        .select("id, username, bio, gd_username, avatar_url, created_at, show_bio, show_gd_username, show_avatar")
        .eq("id", profileId).maybeSingle();
    if (error || !profile) {
        heading.textContent = "Player not found";
        if (description) description.textContent = "This profile may not exist or may not be publicly accessible.";
        return;
    }
    heading.textContent = profile.username || "Player";
    if (description) description.textContent = profile.show_bio === false
        ? "This player has hidden their biography." : (profile.bio || "No biography yet.");
    const own = currentUser?.id === profile.id;
    if (actions) actions.innerHTML = own
        ? '<a class="button button-primary" href="settings.html">Edit profile</a><a class="button button-secondary" href="completion.html">Submit a Completion</a>'
        : '<a class="button button-secondary" href="players.html">Player Leaderboard</a>';
    if (rank) rank.textContent = "—";
    if (points) points.textContent = "Not configured";

    const { data: completions, error: completionError } = await supabaseClient.from("completions")
        .select("id, level_id, verified_at").eq("user_id", profile.id).order("verified_at", { ascending: false });
    if (completionError) { showEmptyState(completionList, "Could not load completions", "Please try again later."); return; }
    const verified = completions || [];
    if (completionsCount) completionsCount.textContent = String(verified.length);
    if (!completionList) return;
    if (!verified.length) { showEmptyState(completionList, "No verified completions", "Verified level completions will appear here."); return; }

    const ids = verified.map(c => c.level_id);
    const { data: levels, error: levelError } = await supabaseClient.from("levels")
        .select("id, name, rank, list_type").in("id", ids);
    if (levelError) { showEmptyState(completionList, "Could not load
                                         if (form.dataset.hllSettingsBound === "true") return;
    form.dataset.hllSettingsBound = "true";

    form.addEventListener("submit", async event => {
        event.preventDefault(); hideMessage(message);
        const button = form.querySelector('[type="submit"]');
        const username = $("settings-username")?.value.trim() || "";
        const bio = $("settings-bio")?.value.trim() || "";
        const gd = $("settings-gd-username")?.value.trim() || "";
        const avatar = $("settings-avatar")?.value.trim() || "";
        if (username.length < 3 || username.length > 24) { showMessage(message, "Your username must be between 3 and 24 characters.", "error"); return; }
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) { showMessage(message, "Use only letters, numbers, underscores, and hyphens in your username.", "error"); return; }
        if (bio.length > 300 || gd.length > 40) { showMessage(message, "Your bio must be 300 characters or less, and your GD username 40 characters or less.", "error"); return; }
        if (avatar) {
            try { const url = new URL(avatar); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
            catch { showMessage(message, "Enter a valid avatar URL beginning with https:// or http://.", "error"); return; }
        }
        setLoading(button, true);
        try {
            const { data, error } = await supabaseClient.from("profiles").update({
                username, bio, gd_username: gd, avatar_url: avatar || null
            }).eq("id", user.id).select().single();
            if (error) throw error;
            currentProfile = { ...currentProfile, ...data };
            showMessage(message, "Profile settings saved successfully!", "success");
        } catch (error) { showMessage(message, getErrorMessage(error), "error"); }
        finally { setLoading(button, false); }
    });

    $("email-settings-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const f = event.currentTarget, msg = $("email-settings-message"), button = f.querySelector('[type="submit"]');
        const email = $("settings-new-email")?.value.trim() || "";
        hideMessage(msg);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMessage(msg, "Enter a valid email address.", "error");
