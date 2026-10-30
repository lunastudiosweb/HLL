/* =========================================================
   HLL — HARDEST LEVELS LIST
   Complete consolidated JavaScript (cleaned, no hotfix blocks)
   ========================================================= */

"use strict";

/* =========================================================
   1. CONFIGURATION
   ========================================================= */

const SUPABASE_URL =
    "https://ldtnptrhnpulvjwdtzwa.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_WXmIU22zRyh_MYtS1jFOJw_b8N9VVYo";

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let authListenerRegistered = false;

const $ = id => document.getElementById(id);

// Returns the first element that exists from a list of possible ids.
const field = (...ids) => {
    for (const id of ids) {
        const element = document.getElementById(id);
        if (element) return element;
    }
    return null;
};

// Works with /completion.html AND clean URLs like /completion or /completion/
const pageName = () => {
    const last = location.pathname.split("/").filter(Boolean).pop() || "index";
    return last.replace(/\.html$/i, "") + ".html";
};

const getQueryParameter = name =>
    new URLSearchParams(location.search).get(name);


/* =========================================================
   2. GENERAL HELPERS
   ========================================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function showMessage(element, message, type = "info") {
    if (!element) {
        if (type === "error") alert(message);
        return;
    }

    element.textContent = message;
    element.dataset.type = type;
    element.hidden = false;
    element.style.display = "";
    element.style.color =
        type === "error" ? "#ff6b6b" :
        type === "success" ? "#42d392" : "";
}

function hideMessage(element) {
    if (!element) return;

    element.hidden = true;
    element.textContent = "";
}

function showEmptyState(element, title, description) {
    if (!element) return;

    const wrapper = document.createElement("div");
    wrapper.className = "empty-state";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = description;

    wrapper.replaceChildren(heading, paragraph);
    element.replaceChildren(wrapper);
}

function getErrorMessage(error) {
    return error?.message || "Something went wrong. Please try again.";
}

// Turns raw database errors into messages you can actually act on.
function describeDbError(error) {
    const code = error?.code || "";
    const text = error?.message || "";

    if (code === "42501" || /row-level security/i.test(text)) {
        return "The database blocked this submission (row-level security). " +
               "An INSERT policy is missing for this table.";
    }

    if (code === "22P02") {
        return "Database type mismatch: a column expects a different ID " +
               "format (for example UUID vs. number). Check the column types.";
    }

    if (code === "23503") {
        return "The selected level no longer exists. Refresh the page and try again.";
    }

    if (code === "23505") {
        return "You have already submitted this.";
    }

    if (code === "23502") {
        return "A required database column was empty: " + text;
    }

    // Unknown error: show everything the server told us.
    const parts = [
        error?.message,
        error?.code ? `(code: ${error.code})` : "",
        error?.details ? `Details: ${error.details}` : "",
        error?.hint ? `Hint: ${error.hint}` : ""
    ].filter(Boolean);

    return parts.join(" ") || getErrorMessage(error);
}

function formatDate(value) {
    if (!value) return "Unknown date";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Unknown date";
    }

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function setLoading(button, loading, fallback = "Submit") {
    if (!button) return;

    if (loading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }

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

    if (next.startsWith("/") && !next.startsWith("//")) {
        return next;
    }

    if (!next.includes(":") && !next.startsWith("//")) {
        return next;
    }

    return "index.html";
}

function validHttpUrl(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol);
    } catch {
        return false;
    }
}

// Supabase returns at most 1000 rows per request, so read big tables in pages.
// buildQuery must return a fresh query that already has a stable .order(...).
async function fetchAllRows(buildQuery, pageSize = 1000) {
    const rows = [];

    for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);

        if (error) return { data: null, error };

        rows.push(...(data || []));

        if (!data || data.length < pageSize) break;
    }

    return { data: rows, error: null };
}

/* ---------- Badges ---------- */

// Cosmetic labels only. They never grant any permissions.
const BADGE_DEFS = [
    { key: "youtube", label: "YouTube", icon: "▶" },
    { key: "verified", label: "Verified", icon: "✔" },
    { key: "admin", label: "Admin", icon: "★" },
    { key: "moderator", label: "Moderator", icon: "◆" }
];

function badgeLabel(key) {
    return BADGE_DEFS.find(def => def.key === key)?.label || String(key || "badge");
}

// Keeps only known badges, in a fixed display order.
function normalizeBadges(value) {
    const list = Array.isArray(value) ? value : [];

    return BADGE_DEFS
        .filter(def => list.includes(def.key))
        .map(def => def.key);
}

function ensureBadgeStyles() {
    if (document.getElementById("hll-badge-styles")) return;

    const style = document.createElement("style");
    style.id = "hll-badge-styles";
    style.textContent = `
        .hll-name-line {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px 8px;
        }

        .hll-badges {
            display: inline-flex;
            flex-wrap: wrap;
            gap: 6px;
            vertical-align: middle;
        }

        .hll-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 999px;
            border: 1px solid currentColor;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: .03em;
            line-height: 1.5;
            white-space: nowrap;
        }

        .hll-badge-youtube {
            color: #ff6b6b;
            background: rgba(255, 70, 70, .14);
        }

        .hll-badge-verified {
            color: #5aaeff;
            background: rgba(90, 174, 255, .14);
        }

        .hll-badge-admin {
            color: #f5c04a;
            background: rgba(245, 192, 74, .14);
        }

        .hll-badge-moderator {
            color: #42d392;
            background: rgba(66, 211, 146, .14);
        }
    `;
    document.head.appendChild(style);
}

// HTML string for a list of badge keys (everything comes from the fixed list above).
function badgeChipsHTML(badges) {
    const keys = normalizeBadges(badges);

    if (!keys.length) return "";

    return `<span class="hll-badges">` + keys.map(key => {
        const def = BADGE_DEFS.find(item => item.key === key);

        return `<span class="hll-badge hll-badge-${def.key}" title="${def.label}">` +
            `<span aria-hidden="true">${def.icon}</span>${def.label}</span>`;
    }).join("") + `</span>`;
}

// profiles.badges is read separately, so the site keeps working
// even before the badges column exists in the database.
async function fetchBadgeMap(profileId = null) {
    const map = new Map();

    try {
        const result = profileId
            ? await supabaseClient
                .from("profiles")
                .select("id, badges")
                .eq("id", profileId)
            : await fetchAllRows(() =>
                supabaseClient
                    .from("profiles")
                    .select("id, badges")
                    .order("id", { ascending: true })
            );

        if (result.error) return map;

        for (const row of result.data || []) {
            map.set(row.id, normalizeBadges(row.badges));
        }
    } catch (error) {
        console.warn("Badges unavailable:", error);
    }

    return map;
}

// Reload the page but keep the scroll position.
function reloadPage() {
    try {
        sessionStorage.setItem("hllScrollY", String(window.scrollY));
    } catch { /* storage unavailable */ }

    location.reload();
}

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Always returns a real levels.id UUID, even if the dropdown value is a
// level name or a "#1 — Name" label for some reason.
async function resolveLevelUuid(rawValue, selectElement) {
    const value = String(rawValue ?? "").trim();

    if (UUID_PATTERN.test(value)) return value;

    const selectedOption = selectElement?.selectedOptions?.[0];
    const optionText = (selectedOption?.textContent || "").trim();

    // Labels look like "#1 — Name"; strip the rank prefix to get the name.
    const nameFromLabel = optionText.replace(/^#\S+\s*[—-]\s*/, "").trim();

    const candidates = [...new Set([value, nameFromLabel].filter(Boolean))];

    for (const candidate of candidates) {
        const { data, error } = await supabaseClient
            .from("levels")
            .select("id")
            .eq("status", "approved")
            .eq("name", candidate)
            .limit(1)
            .maybeSingle();

        if (!error && data?.id && UUID_PATTERN.test(String(data.id))) {
            return data.id;
        }
    }

    return null;
}


/* =========================================================
   3. SUPABASE INITIALIZATION
   ========================================================= */

function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
        if (window.supabase?.createClient) {
            resolve();
            return;
        }

        const existing = document.querySelector(
            'script[data-hll-supabase="true"]'
        );

        if (existing) {
            existing.addEventListener("load", resolve, { once: true });

            existing.addEventListener("error", () => {
                reject(new Error("Could not load Supabase."));
            }, { once: true });

            return;
        }

        const script = document.createElement("script");

        script.src =
            "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.dataset.hllSupabase = "true";
        script.onload = resolve;

        script.onerror = () => {
            reject(new Error("Supabase could not load. Check your connection."));
        };

        document.head.appendChild(script);
    });
}

async function initializeSupabase() {
    await loadSupabaseLibrary();

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        throw new Error("Supabase configuration is incomplete.");
    }

    if (!supabaseClient) {
        supabaseClient = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        );
    }

    return supabaseClient;
}


/* =========================================================
   4. AUTHENTICATION AND PROFILES
   ========================================================= */

async function loadCurrentUser() {
    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient.auth.getUser();

    if (error) {
        currentUser = null;
        currentProfile = null;
        return null;
    }

    currentUser = data.user || null;

    if (currentUser) {
        await ensureProfile();
    } else {
        currentProfile = null;
    }

    return currentUser;
}

async function ensureProfile() {
    if (!currentUser) return null;

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {
        console.error("Profile lookup failed:", error.message);
        return null;
    }

    if (data) {
        currentProfile = data;
        return data;
    }

    const metadata = currentUser.user_metadata || {};

    const rawUsername =
        metadata.username ||
        currentUser.email?.split("@")[0] ||
        "player";

    const username =
        String(rawUsername)
            .replace(/[^a-zA-Z0-9_-]/g, "")
            .slice(0, 24) || "player";

    const { data: created, error: insertError } =
        await supabaseClient
            .from("profiles")
            .insert({
                id: currentUser.id,
                username,
                bio: "",
                gd_username: ""
            })
            .select()
            .single();

    if (!insertError) {
        currentProfile = created;
        return created;
    }

    const retry = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (retry.data) {
        currentProfile = retry.data;
        return retry.data;
    }

    console.warn("Could not create profile:", insertError.message);
    return null;
}

async function requireLogin() {
    const user = await loadCurrentUser();

    if (!user) {
        const next = encodeURIComponent(
            location.pathname + location.search
        );

        location.href = `login.html?next=${next}`;
        return null;
    }

    return user;
}

async function logout() {
    if (!supabaseClient) return;

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        alert("Could not log out: " + getErrorMessage(error));
        return;
    }

    currentUser = null;
    currentProfile = null;

    location.href = "index.html";
}

function updateLoginButton() {
    const button = document.querySelector(".login-button");

    if (!button) return;

    button.textContent = currentUser ? "My Account" : "Log In";

    button.href = currentUser
        ? `profile.html?id=${encodeURIComponent(currentUser.id)}`
        : "login.html";
}

function updateProfileSubmitButton() {
    const button =
        $("profile-submit-button") ||
        document.querySelector(".submit-section .button");

    if (!button) return;

    button.textContent = currentUser
        ? "Submit a Completion"
        : "Sign In to HLL";

    button.href = currentUser
        ? "completion.html"
        : `login.html?next=${encodeURIComponent("completion.html")}`;
}

function registerAuthListener() {
    if (!supabaseClient || authListenerRegistered) return;

    authListenerRegistered = true;

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user || null;

        updateLoginButton();
        updateProfileSubmitButton();
    });
}


/* =========================================================
   5. LOGIN AND SIGNUP
   ========================================================= */

function setupAuthTabs() {
    const loginTab = $("login-tab");
    const signupTab = $("signup-tab");
    const title = $("auth-title");
    const description = $("auth-description");
    const username = $("username");
    const usernameHint = $("username-hint");
    const passwordHint = $("password-hint");
    const submit = $("auth-submit");
    const form = $("auth-form");

    let mode =
        getQueryParameter("mode") === "signup"
            ? "signup"
            : "login";

    function setMode(next) {
        mode = next;

        const signingUp = mode === "signup";

        if (title) {
            title.textContent = signingUp
                ? "Create account"
                : "Welcome back";
        }

        if (description) {
            description.textContent = signingUp
                ? "Create your HLL player account."
                : "Log in to your HLL account.";
        }

        if (loginTab) {
            loginTab.classList.toggle("active", !signingUp);
            loginTab.setAttribute("aria-selected", String(!signingUp));
        }

        if (signupTab) {
            signupTab.classList.toggle("active", signingUp);
            signupTab.setAttribute("aria-selected", String(signingUp));
        }

        if (username) {
            username.hidden = !signingUp;
            username.required = signingUp;
        }

        if (usernameHint) usernameHint.hidden = !signingUp;
        if (passwordHint) passwordHint.hidden = !signingUp;

        if (submit) {
            submit.textContent = signingUp
                ? "Create account"
                : "Log in";
        }
    }

    loginTab?.addEventListener("click", () => setMode("login"));
    signupTab?.addEventListener("click", () => setMode("signup"));

    if (form && form.dataset.hllAuthBound !== "true") {
        form.dataset.hllAuthBound = "true";

        form.addEventListener("submit", async event => {
            event.preventDefault();

            const message = $("auth-message");
            const button = $("auth-submit");

            hideMessage(message);

            const email = $("email")?.value.trim();
            const password = $("password")?.value;
            const enteredUsername = $("username")?.value.trim();

            if (!email || !password) {
                showMessage(message, "Enter your email and password.", "error");
                return;
            }

            if (mode === "signup") {
                if (
                    !enteredUsername ||
                    enteredUsername.length < 3 ||
                    enteredUsername.length > 24
                ) {
                    showMessage(
                        message,
                        "Your username must be between 3 and 24 characters.",
                        "error"
                    );
                    return;
                }

                if (!/^[a-zA-Z0-9_-]+$/.test(enteredUsername)) {
                    showMessage(
                        message,
                        "Use only letters, numbers, underscores, and hyphens in your username.",
                        "error"
                    );
                    return;
                }

                if (password.length < 8) {
                    showMessage(
                        message,
                        "Your password must contain at least 8 characters.",
                        "error"
                    );
                    return;
                }
            }

            setLoading(button, true);

            try {
                if (mode === "signup") {
                    const { data, error } =
                        await supabaseClient.auth.signUp({
                            email,
                            password,
                            options: {
                                data: { username: enteredUsername }
                            }
                        });

                    if (error) throw error;

                    if (data.session && data.user) {
                        currentUser = data.user;

                        const { error: profileError } =
                            await supabaseClient
                                .from("profiles")
                                .upsert({
                                    id: data.user.id,
                                    username: enteredUsername,
                                    bio: "",
                                    gd_username: ""
                                }, { onConflict: "id" });

                        if (profileError) throw profileError;

                        await loadCurrentUser();

                        location.href = safeNextUrl(
                            getQueryParameter("next")
                        );

                        return;
                    }

                    showMessage(
                        message,
                        "Account created! Check your email to confirm your account, then log in.",
                        "success"
                    );

                    setMode("login");
                } else {
                    const { data, error } =
                        await supabaseClient.auth.signInWithPassword({
                            email,
                            password
                        });

                    if (error) throw error;

                    currentUser = data.user;

                    await ensureProfile();

                    location.href = safeNextUrl(
                        getQueryParameter("next")
                    );

                    return;
                }
            } catch (error) {
                showMessage(message, getErrorMessage(error), "error");
            } finally {
                setLoading(button, false);
            }
        });
    }

    setMode(mode);
}


/* =========================================================
   6. POINTS SYSTEM
   ========================================================= */

/*
   CUSTOM POINTS:
   If levels.points exists and contains a number, that value
   is used. This lets you edit points directly in Supabase.

   FALLBACK:
   If no custom points value is available, points are
   calculated from the level's rank.
*/

function calculateLevelPoints(rank, listType, customPoints = null) {
    if (
        customPoints !== null &&
        customPoints !== undefined &&
        customPoints !== ""
    ) {
        const configuredPoints = Number(customPoints);

        if (
            Number.isFinite(configuredPoints) &&
            configuredPoints >= 0
        ) {
            return configuredPoints;
        }
    }

    const position = Number(rank);

    if (!Number.isInteger(position)) return 0;

    if (listType === "main") {
        return position >= 1 && position <= 150
            ? 151 - position
            : 0;
    }

    if (listType === "extended") {
        return position >= 151 && position <= 350
            ? Math.floor(((350 - position) * 49) / 199) + 1
            : 0;
    }

    return 0;
}


/* =========================================================
   7. APPROVED LEVELS
   ========================================================= */

async function getApprovedLevels(listType = null) {
    if (!supabaseClient) return null;

    let query = supabaseClient
        .from("levels")
        .select(
            "id, name, level_id, creator, list_type, rank, description, points, banner_url"
        )
        .eq("status", "approved")
        .order("rank", { ascending: true });

    if (listType) {
        query = query.eq("list_type", listType);
    }

    let { data, error } = await query;

    if (
        error &&
        /points|column|schema cache/i.test(error.message || "")
    ) {
        let fallback = supabaseClient
            .from("levels")
            .select(
                "id, name, level_id, creator, list_type, rank, description, banner_url"
            )
            .eq("status", "approved")
            .order("rank", { ascending: true });

        if (listType) {
            fallback = fallback.eq("list_type", listType);
        }

        const retry = await fallback;

        data = retry.data;
        error = retry.error;

        if (!error) {
            data = (data || []).map(level => ({
                ...level,
                points: null
            }));
        }
    }

    if (error) {
        console.error("Level loading failed:", error);

        showEmptyState(
            $("ranking-list"),
            "Could not load levels",
            error.message || "Check the levels table and Supabase read policies."
        );

        return null;
    }

    return data || [];
}


/* =========================================================
   8. MAIN LIST AND EXTENDED LIST
   ========================================================= */

function ensureLevelBannerStyles() {
    if (document.getElementById("hll-level-banner-styles")) return;

    const style = document.createElement("style");
    style.id = "hll-level-banner-styles";
    style.textContent = `
        .hll-level-card {
            position: relative;
            isolation: isolate;
            overflow: hidden;
        }

        .hll-level-card::before {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 0;
            pointer-events: none;
            background-image:
                linear-gradient(
                    90deg,
                    rgba(13, 13, 15, 1) 0%,
                    rgba(13, 13, 15, .97) 28%,
                    rgba(13, 13, 15, .82) 48%,
                    rgba(13, 13, 15, .35) 76%,
                    rgba(13, 13, 15, .18) 100%
                ),
                var(--hll-banner-image, none);
            background-position: center, right center;
            background-size: cover, cover;
            background-repeat: no-repeat;
            opacity: .96;
            transition: opacity .2s ease, transform .3s ease;
        }

        .hll-level-card > * {
            position: relative;
            z-index: 1;
        }

        .hll-level-card:hover::before {
            opacity: 1;
            transform: scale(1.02);
        }

        @media (max-width: 600px) {
            .hll-level-card::before {
                background-image:
                    linear-gradient(
                        90deg,
                        rgba(13, 13, 15, 1) 0%,
                        rgba(13, 13, 15, .96) 36%,
                        rgba(13, 13, 15, .72) 68%,
                        rgba(13, 13, 15, .3) 100%
                    ),
                    var(--hll-banner-image, none);
            }
        }
    `;
    document.head.appendChild(style);
}

function applyLevelBannerImages(container, levels) {
    if (!container) return;

    const byId = new Map(levels.map(level => [String(level.id), level]));

    container.querySelectorAll(".hll-level-card[data-level-id]").forEach(card => {
        const level = byId.get(card.dataset.levelId);
        if (!level || !level.banner_url) return;

        try {
            const imageURL = new URL(String(level.banner_url).trim());

            if (
                imageURL.protocol !== "https:" &&
                imageURL.protocol !== "http:"
            ) {
                return;
            }

            const safeURL = imageURL.href
                .replace(/\\/g, "\\\\")
                .replace(/"/g, "\\\"");

            card.style.setProperty(
                "--hll-banner-image",
                `url("${safeURL}")`
            );
        } catch (error) {
            console.warn(
                "Invalid banner URL for level:",
                level.name,
                error
            );
        }
    });
}

async function renderLevelList(listType) {
    ensureLevelBannerStyles();

    const list = $("ranking-list");
    const count = $("list-count");
    const search = $("level-search");

    if (!list) return;

    const isMain = listType === "main";
    const minRank = isMain ? 1 : 151;
    const maxRank = isMain ? 150 : 350;
    const listName = isMain ? "Main List" : "Extended List";

    showEmptyState(
        list,
        "Loading rankings...",
        `Fetching approved ${listName} levels.`
    );

    if (count) count.textContent = "Loading rankings...";

    const allLevels = await getApprovedLevels(listType);

    if (allLevels === null) {
        if (count) count.textContent = "Rankings could not be loaded.";
        return;
    }

    const levels = allLevels
        .filter(level => {
            const rank = Number(level.rank);

            return Number.isInteger(rank) &&
                rank >= minRank &&
                rank <= maxRank;
        })
        .sort((a, b) => Number(a.rank) - Number(b.rank));

    function render(items) {
        if (count) {
            count.textContent =
                `${items.length} levels · Ranks #${minRank}–#${maxRank}`;
        }

        if (!items.length) {
            showEmptyState(
                list,
                "No ranked levels yet",
                `No approved levels with ranks #${minRank}–#${maxRank} are available in the ${listName}.`
            );

            return;
        }

        list.innerHTML = items.map(level => {
            const rank = Number(level.rank);

            const points = calculateLevelPoints(
                level.rank,
                level.list_type,
                level.points
            );

            let rankClass = "";

            if (rank === 1) rankClass = "rank-first";
            else if (rank === 2) rankClass = "rank-second";
            else if (rank === 3) rankClass = "rank-third";

            return `
                <a
                    class="ranking-item hll-level-card"
                    data-level-id="${escapeHTML(level.id)}"
                    href="level.html?id=${encodeURIComponent(level.id)}"
                >
                    <span class="ranking-position ${rankClass}">
                        #${escapeHTML(rank)}
                    </span>

                    <span class="ranking-details">
                        <strong>${escapeHTML(level.name || "Unnamed level")}</strong>

                        <span class="hll-level-meta">
                            ${escapeHTML(level.creator || "Unknown creator")}
                            ${level.level_id
                                ? ` · GD ID: ${escapeHTML(level.level_id)}`
                                : ""}
                        </span>
                    </span>

                    <span class="hll-points-badge">
                        <strong>${Number(points).toLocaleString()}</strong>
                        <small>POINTS</small>
                    </span>

                    <span class="ranking-arrow" aria-hidden="true">›</span>
                </a>
            `;
        }).join("");

        applyLevelBannerImages(list, items);
    }

    render(levels);

    const staffInfo = await getStaffInfo();

    if (staffInfo) {
        setupLevelContextMenu(list, levels, staffInfo);

        if (staffCan(staffInfo, "manage_levels")) {
            await setupRemovedLevelsPanel(list, listType);
        }
    }

    try {
        const savedScroll = sessionStorage.getItem("hllScrollY");

        if (savedScroll !== null) {
            sessionStorage.removeItem("hllScrollY");
            window.scrollTo(0, Number(savedScroll) || 0);
        }
    } catch { /* storage unavailable */ }

    if (search && search.dataset.hllSearchBound !== "true") {
        search.dataset.hllSearchBound = "true";

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


/* =========================================================
   9. PLAYER LEADERBOARD
   ========================================================= */

function ensureStaffMenuStyles() {
    if (document.getElementById("hll-staff-menu-styles")) return;

    const style = document.createElement("style");
    style.id = "hll-staff-menu-styles";
    style.textContent = `
        .hll-staff-menu {
            position: fixed;
            z-index: 9999;
            min-width: 230px;
            padding: 6px;
            background: #17171c;
            border: 1px solid rgba(255, 255, 255, .14);
            border-radius: 10px;
            box-shadow: 0 12px 32px rgba(0, 0, 0, .55);
            font-size: 14px;
        }

        .hll-staff-menu-title {
            padding: 6px 10px;
            color: #9a9aa6;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: .06em;
        }

        .hll-staff-menu button {
            display: block;
            width: 100%;
            padding: 9px 10px;
            background: none;
            border: 0;
            border-radius: 6px;
            color: #f2f2f5;
            text-align: left;
            font: inherit;
            cursor: pointer;
        }

        .hll-staff-menu button:hover {
            background: rgba(255, 255, 255, .08);
        }

        .hll-staff-menu button.danger {
            color: #ff6b6b;
        }
    `;
    document.head.appendChild(style);
}

async function isCurrentUserStaff() {
    if (!currentUser) return false;

    const { data } = await supabaseClient
        .from("staff_members")
        .select("role")
        .eq("user_id", currentUser.id)
        .maybeSingle();

    return !!data && ["admin", "moderator"].includes(data.role);
}

// Cached per user: { role, permissions } for admins and moderators, else null.
let staffInfoCache = { userId: null, promise: null };

function getStaffInfo() {
    const userId = currentUser?.id || null;

    if (!userId) return Promise.resolve(null);

    if (staffInfoCache.userId !== userId || !staffInfoCache.promise) {
        staffInfoCache = {
            userId,
            promise: (async () => {
                let { data, error } = await supabaseClient
                    .from("staff_members")
                    .select("role, permissions")
                    .eq("user_id", userId)
                    .maybeSingle();

                if (error) {
                    // The permissions column is not installed yet.
                    const retry = await supabaseClient
                        .from("staff_members")
                        .select("role")
                        .eq("user_id", userId)
                        .maybeSingle();

                    data = retry.data ? { ...retry.data, permissions: null } : null;
                }

                if (!data || !["admin", "moderator"].includes(data.role)) {
                    return null;
                }

                return data;
            })()
        };
    }

    return staffInfoCache.promise;
}

// Admins can do everything. Moderators need the specific permission ticked.
function staffCan(info, permission) {
    if (!info) return false;
    if (info.role === "admin") return true;
    if (!info.permissions) return true; // permissions not configured yet
    return info.permissions[permission] === true;
}

// Generic right-click / long-press menu for staff.
// buildMenu(item) must return { title, entries: [{ label, onClick, danger }] }
function bindStaffContextMenu(list, cardSelector, getItem, buildMenu) {
    if (!list || list.dataset.hllStaffMenuBound === "true") return;

    list.dataset.hllStaffMenuBound = "true";

    ensureStaffMenuStyles();

    let menu = null;

    function closeMenu() {
        if (menu) menu.remove();
        menu = null;
    }

    function openMenu(x, y, item) {
        closeMenu();

        const { title, entries } = buildMenu(item);

        menu = document.createElement("div");
        menu.className = "hll-staff-menu";
        menu.setAttribute("role", "menu");

        const heading = document.createElement("div");
        heading.className = "hll-staff-menu-title";
        heading.textContent = title;
        menu.appendChild(heading);

        entries.forEach(entry => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = entry.label;
            if (entry.danger) button.className = "danger";

            button.addEventListener("click", () => {
                closeMenu();
                entry.onClick();
            });

            menu.appendChild(button);
        });

        document.body.appendChild(menu);

        const rect = menu.getBoundingClientRect();

        menu.style.left =
            Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + "px";

        menu.style.top =
            Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + "px";
    }

    function itemFromEvent(event) {
        const card = event.target.closest?.(cardSelector);

        return card ? getItem(card) : null;
    }

    list.addEventListener("contextmenu", event => {
        const item = itemFromEvent(event);

        if (!item) return;

        event.preventDefault();
        openMenu(event.clientX, event.clientY, item);
    });

    // Long-press for touch screens.
    let pressTimer = null;
    let longPressed = false;

    list.addEventListener("touchstart", event => {
        const item = itemFromEvent(event);

        if (!item) return;

        longPressed = false;

        const touch = event.touches[0];

        pressTimer = setTimeout(() => {
            longPressed = true;
            openMenu(touch.clientX, touch.clientY, item);
        }, 600);
    }, { passive: true });

    ["touchend", "touchmove", "touchcancel"].forEach(name => {
        list.addEventListener(name, () => clearTimeout(pressTimer), { passive: true });
    });

    list.addEventListener("click", event => {
        if (longPressed) {
            event.preventDefault();
            longPressed = false;
        }
    });

    document.addEventListener("click", event => {
        if (menu && !menu.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeMenu();
    });

    window.addEventListener("scroll", closeMenu, { passive: true });
    window.addEventListener("resize", closeMenu);
}

/* ---------- Admin logs ---------- */

// ["manage_players", "manage_levels"] -> "manage players and manage levels"
function joinPermissionList(keys) {
    const names = (Array.isArray(keys) ? keys : [])
        .map(key => String(key).replace(/_/g, " "));

    if (names.length <= 1) return names[0] || "nothing";

    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

function describeLog(log) {
    const d = log.details || {};
    const target = log.target_name || "Unknown";
    const quoted = `"${target}"`;
    const player = d.player || "a player";

    switch (log.action) {
        case "level_added":
            return `added the level ${quoted}` +
                (d.rank ? ` at #${d.rank}` : "") +
                (d.list_type ? ` in the ${d.list_type} list` : "");

        case "level_moved":
            return `moved ${quoted} ${d.direction || ""} from #${d.from_rank} to #${d.to_rank}` +
                (d.swapped_with ? ` (swapped with "${d.swapped_with}")` : "");

        case "level_removed":
            return `removed the level ${quoted}` +
                (d.rank ? ` (was #${d.rank})` : "");

        case "level_restored":
            return `restored the level ${quoted}` +
                (d.rank ? ` to #${d.rank}` : "");

        case "completion_approved":
            return `approved ${player}'s completion of ${quoted}`;

        case "completion_rejected":
            return `rejected ${player}'s completion submission for ${quoted}`;

        case "completion_removed":
            return `removed ${player}'s completion of ${quoted}`;

        case "level_submission_rejected":
            return `rejected the level suggestion ${quoted}`;

        case "points_edited":
            return `changed ${target}'s points adjustment from ` +
                `${d.old_adjustment ?? 0} to ${d.new_adjustment ?? 0}`;

        case "player_hidden":
            return `removed ${target} from the leaderboard`;

        case "player_restored":
            return `restored ${target} to the leaderboard`;

        case "role_changed": {
            const from = d.old_role || "player";
            const to = d.new_role || "player";
            const level = { player: 0, moderator: 1, admin: 2 };

            if (to === "player") {
                return `removed ${target}'s ${roleLabel(from)} role`;
            }

            if (from === to) {
                return `updated ${target}'s ${roleLabel(to)} settings`;
            }

            return `${level[to] > level[from] ? "promoted" : "demoted"} ` +
                `${target} to ${roleLabel(to)}`;
        }

        case "badge_added":
            return `gave ${target} the ${badgeLabel(d.badge)} badge`;

        case "badge_removed":
            return `removed the ${badgeLabel(d.badge)} badge from ${target}`;

        case "permissions_granted":
            return `granted ${target} permission to ${joinPermissionList(d.permissions)}`;

        case "permissions_revoked":
            return `revoked ${target}'s permission to ${joinPermissionList(d.permissions)}`;

        default:
            return `${log.action}: ${target}`;
    }
}

function logCategory(action) {
    if (/^(role|permission)/.test(String(action))) return "Roles";
    if (String(action).startsWith("level_submission")) return "Submissions";
    if (String(action).startsWith("level")) return "Levels";
    if (String(action).startsWith("completion")) return "Completions";
    return "Players";
}

async function openLogsPanel() {
    if (document.getElementById("hll-logs-panel")) return;

    if (!document.getElementById("hll-logs-styles")) {
        const style = document.createElement("style");
        style.id = "hll-logs-styles";
        style.textContent = `
            .hll-logs-overlay {
                position: fixed;
                inset: 0;
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                background: rgba(0, 0, 0, .7);
            }

            .hll-logs-box {
                display: flex;
                flex-direction: column;
                width: min(900px, 100%);
                height: min(85vh, 760px);
                background: #17171c;
                border: 1px solid rgba(255, 255, 255, .14);
                border-radius: 12px;
                box-shadow: 0 16px 48px rgba(0, 0, 0, .6);
                color: #f2f2f5;
            }

            .hll-logs-header {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 10px;
                padding: 14px 18px;
                border-bottom: 1px solid rgba(255, 255, 255, .1);
            }

            .hll-logs-header h3 {
                margin: 0 auto 0 0;
                font-size: 17px;
            }

            .hll-logs-header select,
            .hll-logs-header input {
                padding: 7px 10px;
                background: #0f0f13;
                border: 1px solid rgba(255, 255, 255, .16);
                border-radius: 8px;
                color: inherit;
                font: inherit;
            }

            .hll-logs-header button,
            .hll-logs-more {
                padding: 7px 14px;
                background: rgba(255, 255, 255, .08);
                border: 0;
                border-radius: 8px;
                color: inherit;
                font: inherit;
                cursor: pointer;
            }

            .hll-logs-list {
                flex: 1;
                padding: 4px 18px;
                overflow-y: auto;
            }

            .hll-log-row {
                display: flex;
                gap: 14px;
                padding: 11px 0;
                border-bottom: 1px solid rgba(255, 255, 255, .07);
                line-height: 1.4;
            }

            .hll-log-time {
                flex: 0 0 150px;
                color: #9a9aa6;
                font-size: 12.5px;
            }

            .hll-log-tag {
                flex: 0 0 auto;
                align-self: flex-start;
                padding: 2px 8px;
                border-radius: 999px;
                background: rgba(255, 255, 255, .08);
                color: #b9b9c4;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: .05em;
            }

            .hll-log-text {
                flex: 1;
                min-width: 0;
                overflow-wrap: anywhere;
            }

            .hll-logs-footer {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                padding: 12px 18px;
                border-top: 1px solid rgba(255, 255, 255, .1);
                color: #9a9aa6;
                font-size: 13px;
            }

            @media (max-width: 640px) {
                .hll-log-row {
                    flex-wrap: wrap;
                }

                .hll-log-time {
                    flex-basis: 100%;
                }
            }
        `;
        document.head.appendChild(style);
    }

    const PAGE_SIZE = 100;

    const overlay = document.createElement("div");
    overlay.id = "hll-logs-panel";
    overlay.className = "hll-logs-overlay";

    const box = document.createElement("div");
    box.className = "hll-logs-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");

    const header = document.createElement("div");
    header.className = "hll-logs-header";

    const heading = document.createElement("h3");
    heading.textContent = "Staff logs";

    const filter = document.createElement("select");

    ["All", "Levels", "Completions", "Submissions", "Players", "Roles"].forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name === "All" ? "All changes" : name;
        filter.appendChild(option);
    });

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search staff, level, player...";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";

    header.append(heading, filter, search, closeButton);

    const listElement = document.createElement("div");
    listElement.className = "hll-logs-list";

    const footer = document.createElement("div");
    footer.className = "hll-logs-footer";

    const status = document.createElement("span");

    const moreButton = document.createElement("button");
    moreButton.type = "button";
    moreButton.className = "hll-logs-more";
    moreButton.textContent = "Load older";

    footer.append(status, moreButton);

    box.append(header, listElement, footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const entries = [];
    let exhausted = false;

    function onKey(event) {
        if (event.key === "Escape") close();
    }

    function close() {
        overlay.remove();
        document.removeEventListener("keydown", onKey);

        if (location.hash === "#logs") {
            history.replaceState(null, "", location.pathname + location.search);
        }
    }

    closeButton.addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    overlay.addEventListener("click", event => {
        if (event.target === overlay) close();
    });

    function render() {
        const term = search.value.trim().toLowerCase();
        const category = filter.value;

        const visible = entries.filter(log => {
            if (category !== "All" && logCategory(log.action) !== category) {
                return false;
            }

            if (!term) return true;

            return (
                String(log.actor_name || "").toLowerCase().includes(term) ||
                String(log.target_name || "").toLowerCase().includes(term) ||
                describeLog(log).toLowerCase().includes(term)
            );
        });

        listElement.textContent = "";

        if (!visible.length) {
            const empty = document.createElement("p");
            empty.style.color = "#9a9aa6";

            empty.textContent = entries.length
                ? "No loaded entries match. Try \"Load older\" or change the filter."
                : "No staff actions have been logged yet.";

            listElement.appendChild(empty);
        }

        visible.forEach(log => {
            const row = document.createElement("div");
            row.className = "hll-log-row";

            const time = document.createElement("div");
            time.className = "hll-log-time";
            time.textContent = new Date(log.created_at).toLocaleString();

            const tag = document.createElement("span");
            tag.className = "hll-log-tag";
            tag.textContent = logCategory(log.action);

            const text = document.createElement("div");
            text.className = "hll-log-text";

            const actor = document.createElement("strong");
            actor.textContent = log.actor_name || "System";

            text.append(actor, " " + describeLog(log));

            row.append(time, tag, text);
            listElement.appendChild(row);
        });

        status.textContent =
            `${visible.length} shown · ${entries.length} loaded`;

        moreButton.hidden = exhausted;
    }

    async function loadMore() {
        moreButton.disabled = true;
        moreButton.textContent = "Loading...";

        const from = entries.length;

        const { data, error } = await supabaseClient
            .from("staff_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        moreButton.disabled = false;
        moreButton.textContent = "Load older";

        if (error) {
            console.error("Could not load logs:", error);

            listElement.textContent =
                /staff_logs|relation|schema cache/i.test(error.message || "")
                    ? "The logs table is not installed in the database yet."
                    : getErrorMessage(error);

            moreButton.hidden = true;
            return;
        }

        entries.push(...(data || []));

        if ((data || []).length < PAGE_SIZE) exhausted = true;

        render();
    }

    filter.addEventListener("change", render);
    search.addEventListener("input", render);
    moreButton.addEventListener("click", loadMore);

    listElement.textContent = "Loading...";
    await loadMore();
}

/* ---------- Staff menu: one nav tab with a hover dropdown ---------- */

function ensureStaffTabStyles() {
    if (document.getElementById("hll-staff-tab-styles")) return;

    const style = document.createElement("style");
    style.id = "hll-staff-tab-styles";
    style.textContent = `
        .hll-staff-caret {
            display: inline-block;
            margin-left: 4px;
            font-size: .8em;
            opacity: .75;
            transition: transform .15s ease;
        }

        #hll-staff-tab[aria-expanded="true"] .hll-staff-caret {
            transform: rotate(180deg);
        }

        .hll-staff-dropdown {
            position: fixed;
            z-index: 9500;
            min-width: 200px;
            padding: 6px;
            background: #17171c;
            border: 1px solid rgba(255, 255, 255, .14);
            border-radius: 10px;
            box-shadow: 0 12px 32px rgba(0, 0, 0, .55);
            font-size: 14px;
        }

        .hll-staff-dropdown[hidden] {
            display: none;
        }

        .hll-staff-dropdown a {
            display: block;
            padding: 9px 12px;
            border-radius: 6px;
            color: #f2f2f5;
            text-decoration: none;
            white-space: nowrap;
        }

        .hll-staff-dropdown a:hover,
        .hll-staff-dropdown a:focus-visible {
            background: rgba(255, 255, 255, .08);
            outline: none;
        }

        .hll-staff-dropdown small {
            display: block;
            color: #9a9aa6;
            font-size: 12px;
        }
    `;
    document.head.appendChild(style);
}

// Adds one "Staff" tab to the nav for staff. Hovering it (or tapping it on a
// phone) opens a dropdown: Dashboard for all staff, Logs and Roles for admins.
async function setupStaffMenu() {
    if (!currentUser || document.getElementById("hll-staff-tab")) return;

    const info = await getStaffInfo();

    if (!info) return;

    const isAdmin = info.role === "admin";

    ensureStaffTabStyles();

    const entries = [
        { label: "Staff Dashboard", sub: "Review submissions", href: "staff.html" }
    ];

    if (isAdmin) {
        entries.push(
            { label: "Logs", sub: "Every staff change", hash: "logs", onClick: openLogsPanel },
            { label: "Roles", sub: "Admins, moderators and permissions", hash: "roles", onClick: openRolesPanel }
        );
    }

    // 1) Reuse an existing Staff link in the nav, 2) otherwise copy a nav link,
    // 3) otherwise fall back to a small floating button.
    let tab = document.querySelector('nav a[href="staff.html"], header a[href="staff.html"]');

    if (!tab) {
        const links = [...document.querySelectorAll("nav a, header nav a")]
            .filter(link => !link.classList.contains("login-button"));

        const reference = links[links.length - 1];

        if (reference) {
            const host = reference.closest("li") || reference;
            const clone = host.cloneNode(true);

            tab = clone.matches("a") ? clone : clone.querySelector("a");

            if (tab) {
                tab.classList.remove("active", "current");
                tab.removeAttribute("aria-current");
                host.insertAdjacentElement("afterend", clone);
            }
        }
    }

    if (!tab) {
        tab = document.createElement("a");

        Object.assign(tab.style, {
            position: "fixed",
            right: "16px",
            bottom: "16px",
            zIndex: "9000",
            padding: "10px 16px",
            background: "#17171c",
            border: "1px solid rgba(255,255,255,.2)",
            borderRadius: "999px",
            color: "#f2f2f5",
            textDecoration: "none"
        });

        document.body.appendChild(tab);
    }

    tab.id = "hll-staff-tab";
    tab.href = "#staff";
    tab.textContent = "Staff";
    tab.classList.remove("active", "current");
    tab.removeAttribute("aria-current");
    tab.setAttribute("aria-haspopup", "menu");
    tab.setAttribute("aria-expanded", "false");

    const caret = document.createElement("span");
    caret.className = "hll-staff-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "▾";
    tab.appendChild(caret);

    const dropdown = document.createElement("div");
    dropdown.id = "hll-staff-dropdown";
    dropdown.className = "hll-staff-dropdown";
    dropdown.setAttribute("role", "menu");
    dropdown.hidden = true;

    let closeTimer = null;
    let openedAt = 0;

    function close() {
        clearTimeout(closeTimer);
        dropdown.hidden = true;
        tab.setAttribute("aria-expanded", "false");
    }

    function closeSoon() {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(close, 180);
    }

    function open() {
        clearTimeout(closeTimer);

        dropdown.hidden = false;

        const rect = tab.getBoundingClientRect();
        const width = dropdown.offsetWidth;
        const height = dropdown.offsetHeight;

        const left = Math.min(
            Math.max(8, rect.left),
            Math.max(8, window.innerWidth - width - 8)
        );

        // Open upwards when there is no room below (for example the floating button).
        const fitsBelow = rect.bottom + 6 + height <= window.innerHeight;
        const top = fitsBelow || rect.top - height - 6 < 8
            ? rect.bottom + 6
            : rect.top - height - 6;

        dropdown.style.left = `${left}px`;
        dropdown.style.top = `${top}px`;

        tab.setAttribute("aria-expanded", "true");
        openedAt = Date.now();
    }

    entries.forEach(entry => {
        const item = document.createElement("a");
        item.href = entry.href || `#${entry.hash}`;
        item.setAttribute("role", "menuitem");

        const label = document.createElement("span");
        label.textContent = entry.label;

        const sub = document.createElement("small");
        sub.textContent = entry.sub;

        item.append(label, sub);

        if (entry.onClick) {
            item.addEventListener("click", event => {
                event.preventDefault();
                close();
                entry.onClick();
            });
        }

        dropdown.appendChild(item);
    });

    document.body.appendChild(dropdown);

    tab.addEventListener("mouseenter", open);
    tab.addEventListener("mouseleave", closeSoon);
    dropdown.addEventListener("mouseenter", () => clearTimeout(closeTimer));
    dropdown.addEventListener("mouseleave", closeSoon);

    // Tap/click: open it, or close it if it has been open for a moment already.
    // (A hover that has just opened the menu is not undone by the click that follows.)
    tab.addEventListener("click", event => {
        event.preventDefault();

        if (dropdown.hidden) {
            open();
        } else if (Date.now() - openedAt > 400) {
            close();
        }
    });

    tab.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            event.preventDefault();
            open();
            dropdown.querySelector("a")?.focus();
        }
    });

    dropdown.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            close();
            tab.focus();
        }
    });

    document.addEventListener("click", event => {
        if (!dropdown.hidden && !dropdown.contains(event.target) && !tab.contains(event.target)) {
            close();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") close();
    });

    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);

    if (isAdmin && location.hash === "#logs") openLogsPanel();
    if (isAdmin && location.hash === "#roles") openRolesPanel();
}

/* ---------- Roles (admin only) ---------- */

const STAFF_PERMISSIONS = [
    {
        key: "review_completions",
        label: "Review completions",
        hint: "Approve or reject submitted completions."
    },
    {
        key: "remove_completions",
        label: "Remove completions",
        hint: "Delete verified completions from a level."
    },
    {
        key: "manage_levels",
        label: "Manage levels",
        hint: "Move, remove and restore levels."
    },
    {
        key: "manage_players",
        label: "Manage players",
        hint: "Edit player points and hide players from the leaderboard."
    }
];

function roleLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "moderator") return "Moderator";
    return "Player";
}

async function openRolesPanel() {
    if (document.getElementById("hll-roles-panel")) return;

    if (!document.getElementById("hll-roles-styles")) {
        const style = document.createElement("style");
        style.id = "hll-roles-styles";
        style.textContent = `
            .hll-roles-overlay {
                position: fixed;
                inset: 0;
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                background: rgba(0, 0, 0, .7);
            }

            .hll-roles-box {
                display: flex;
                flex-direction: column;
                width: min(640px, 100%);
                height: min(80vh, 680px);
                background: #17171c;
                border: 1px solid rgba(255, 255, 255, .14);
                border-radius: 12px;
                box-shadow: 0 16px 48px rgba(0, 0, 0, .6);
                color: #f2f2f5;
            }

            .hll-roles-header {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 10px;
                padding: 14px 18px;
                border-bottom: 1px solid rgba(255, 255, 255, .1);
            }

            .hll-roles-header h3 {
                margin: 0 auto 0 0;
                font-size: 17px;
            }

            .hll-roles-header input,
            .hll-roles-body select {
                padding: 8px 10px;
                background: #0f0f13;
                border: 1px solid rgba(255, 255, 255, .16);
                border-radius: 8px;
                color: inherit;
                font: inherit;
            }

            .hll-roles-header button,
            .hll-roles-back {
                padding: 7px 14px;
                background: rgba(255, 255, 255, .08);
                border: 0;
                border-radius: 8px;
                color: inherit;
                font: inherit;
                cursor: pointer;
            }

            .hll-roles-body {
                flex: 1;
                padding: 8px 18px 18px;
                overflow-y: auto;
            }

            .hll-roles-row {
                display: flex;
                align-items: center;
                gap: 12px;
                width: 100%;
                padding: 12px 8px;
                background: none;
                border: 0;
                border-bottom: 1px solid rgba(255, 255, 255, .07);
                color: inherit;
                font: inherit;
                text-align: left;
                cursor: pointer;
            }

            .hll-roles-row:hover {
                background: rgba(255, 255, 255, .05);
            }

            .hll-roles-name {
                flex: 1;
                min-width: 0;
                overflow-wrap: anywhere;
            }

            .hll-roles-badge {
                padding: 2px 10px;
                border-radius: 999px;
                background: rgba(255, 255, 255, .08);
                color: #b9b9c4;
                font-size: 12px;
            }

            .hll-roles-badge-admin {
                background: rgba(255, 107, 107, .16);
                color: #ff8f8f;
            }

            .hll-roles-badge-moderator {
                background: rgba(127, 180, 255, .16);
                color: #7fb4ff;
            }

            .hll-roles-form {
                display: flex;
                flex-direction: column;
                gap: 14px;
                margin-top: 16px;
            }

            .hll-roles-form > label {
                font-weight: 600;
            }

            .hll-roles-perms {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .hll-roles-perms[hidden] {
                display: none;
            }

            .hll-roles-perm {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                padding: 10px 12px;
                background: rgba(255, 255, 255, .04);
                border-radius: 8px;
                cursor: pointer;
            }

            .hll-roles-perm small {
                display: block;
                color: #9a9aa6;
            }

            .hll-roles-note {
                margin: 0;
                color: #9a9aa6;
                font-size: 13px;
            }

            .hll-roles-save {
                align-self: flex-start;
                padding: 9px 18px;
                background: #42d392;
                border: 0;
                border-radius: 8px;
                color: #0d0d0f;
                font: inherit;
                font-weight: 600;
                cursor: pointer;
            }

            .hll-roles-save:disabled {
                opacity: .5;
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);
    }

    const overlay = document.createElement("div");
    overlay.id = "hll-roles-panel";
    overlay.className = "hll-roles-overlay";

    const box = document.createElement("div");
    box.className = "hll-roles-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");

    const header = document.createElement("div");
    header.className = "hll-roles-header";

    const heading = document.createElement("h3");
    heading.textContent = "Staff roles";

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search players...";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";

    header.append(heading, search, closeButton);

    const body = document.createElement("div");
    body.className = "hll-roles-body";

    box.append(header, body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let users = [];

    function onKey(event) {
        if (event.key === "Escape") close();
    }

    function close() {
        overlay.remove();
        document.removeEventListener("keydown", onKey);

        if (location.hash === "#roles") {
            history.replaceState(null, "", location.pathname + location.search);
        }
    }

    closeButton.addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    overlay.addEventListener("click", event => {
        if (event.target === overlay) close();
    });

    function sortUsers() {
        const order = { admin: 0, moderator: 1 };

        users.sort((a, b) =>
            (order[a.role] ?? 2) - (order[b.role] ?? 2) ||
            String(a.username || "").localeCompare(String(b.username || ""))
        );
    }

    function renderList() {
        heading.textContent = "Staff roles";
        search.hidden = false;
        body.textContent = "";

        const term = search.value.trim().toLowerCase();

        const visible = users.filter(user =>
            !term ||
            String(user.username || "").toLowerCase().includes(term) ||
            roleLabel(user.role).toLowerCase().includes(term)
        );

        if (!visible.length) {
            const empty = document.createElement("p");
            empty.style.color = "#9a9aa6";
            empty.textContent = "No players found.";
            body.appendChild(empty);
            return;
        }

        visible.forEach(user => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "hll-roles-row";

            const name = document.createElement("span");
            name.className = "hll-roles-name";
            name.textContent =
                (user.username || "Player") +
                (user.id === currentUser?.id ? " (you)" : "");

            const badge = document.createElement("span");
            badge.className = `hll-roles-badge hll-roles-badge-${user.role || "player"}`;
            badge.textContent = roleLabel(user.role);

            const chevron = document.createElement("span");
            chevron.setAttribute("aria-hidden", "true");
            chevron.textContent = "›";

            row.append(name, badge, chevron);
            row.addEventListener("click", () => renderEditor(user));

            body.appendChild(row);
        });
    }

    function renderEditor(user) {
        heading.textContent = user.username || "Player";
        search.hidden = true;
        body.textContent = "";

        const isSelf = user.id === currentUser?.id;

        const back = document.createElement("button");
        back.type = "button";
        back.className = "hll-roles-back";
        back.textContent = "← All players";
        back.addEventListener("click", renderList);

        const form = document.createElement("div");
        form.className = "hll-roles-form";

        const roleLabelElement = document.createElement("label");
        roleLabelElement.htmlFor = "hll-roles-select";
        roleLabelElement.textContent = "Role";

        const select = document.createElement("select");
        select.id = "hll-roles-select";

        [
            ["none", "Player (no staff access)"],
            ["moderator", "Moderator"],
            ["admin", "Admin"]
        ].forEach(([value, text]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            select.appendChild(option);
        });

        select.value = user.role || "none";
        select.disabled = isSelf;

        const permissionBox = document.createElement("div");
        permissionBox.className = "hll-roles-perms";

        const checks = {};

        STAFF_PERMISSIONS.forEach(permission => {
            const label = document.createElement("label");
            label.className = "hll-roles-perm";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked =
                user.role === "admin" || user.permissions?.[permission.key] === true;

            const text = document.createElement("div");

            const title = document.createElement("strong");
            title.textContent = permission.label;

            const hint = document.createElement("small");
            hint.textContent = permission.hint;

            text.append(title, hint);
            label.append(checkbox, text);

            checks[permission.key] = checkbox;
            permissionBox.appendChild(label);
        });

        const note = document.createElement("p");
        note.className = "hll-roles-note";

        function refresh() {
            const role = select.value;
            const admin = role === "admin";

            permissionBox.hidden = role === "none";

            Object.values(checks).forEach(checkbox => {
                if (admin) checkbox.checked = true;
                checkbox.disabled = admin || isSelf;
            });

            if (isSelf) {
                note.textContent = "You cannot change your own role.";
            } else if (admin) {
                note.textContent =
                    "Admins can do everything, including managing roles and viewing the logs.";
            } else if (role === "moderator") {
                note.textContent =
                    "Tick what this moderator is allowed to do. Only admins see the Logs and Roles tabs.";
            } else {
                note.textContent = "This player has no staff access.";
            }
        }

        select.addEventListener("change", refresh);
        refresh();

        const status = document.createElement("p");
        status.className = "hll-roles-note";

        const save = document.createElement("button");
        save.type = "button";
        save.className = "hll-roles-save";
        save.textContent = "Save changes";
        save.disabled = isSelf;

        save.addEventListener("click", async () => {
            const role = select.value;
            const name = user.username || "this player";

            if (role === (user.role || "none") && role !== "moderator") {
                status.style.color = "";
                status.textContent = "Nothing to change.";
                return;
            }

            if (role === "admin" && user.role !== "admin" && !confirm(
                `Make ${name} an admin?\n\n` +
                "Admins can manage roles, see the logs and do everything moderators can."
            )) return;

            if (role === "none" && user.role && !confirm(
                `Remove ${name}'s staff access?`
            )) return;

            const permissions = {};

            STAFF_PERMISSIONS.forEach(permission => {
                permissions[permission.key] =
                    role === "admin" ? true : checks[permission.key].checked;
            });

            save.disabled = true;
            save.textContent = "Saving...";
            status.style.color = "";
            status.textContent = "";

            const { error } = await supabaseClient.rpc("admin_set_staff_role", {
                p_user_id: user.id,
                p_role: role,
                p_permissions: permissions
            });

            save.disabled = false;
            save.textContent = "Save changes";

            if (error) {
                console.error("Role change failed:", error);
                status.style.color = "#ff6b6b";
                status.textContent = getErrorMessage(error);
                return;
            }

            user.role = role === "none" ? null : role;
            user.permissions = role === "none" ? {} : permissions;
            sortUsers();

            status.style.color = "#42d392";
            status.textContent = "Saved. The change applies the next time they load the site.";
        });

        form.append(
            roleLabelElement,
            select,
            note,
            permissionBox,
            save,
            status
        );

        body.append(back, form);
    }

    search.addEventListener("input", renderList);

    body.textContent = "Loading...";

    const { data, error } = await supabaseClient.rpc("admin_list_users");

    if (error) {
        console.error("Could not load users:", error);

        body.textContent =
            /admin_list_users|function|schema cache/i.test(error.message || "")
                ? "Role management is not installed in the database yet."
                : getErrorMessage(error);

        return;
    }

    users = data || [];
    sortUsers();
    renderList();
}


// Staff-only popup listing a level's verified completions with a Remove button.
async function openLevelCompletionsModal(level) {
    if (document.getElementById("hll-completions-modal")) return;

    if (!document.getElementById("hll-completions-modal-styles")) {
        const style = document.createElement("style");
        style.id = "hll-completions-modal-styles";
        style.textContent = `
            .hll-modal-overlay {
                position: fixed;
                inset: 0;
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                background: rgba(0, 0, 0, .65);
            }

            .hll-modal-box {
                display: flex;
                flex-direction: column;
                width: min(560px, 100%);
                max-height: 80vh;
                background: #17171c;
                border: 1px solid rgba(255, 255, 255, .14);
                border-radius: 12px;
                box-shadow: 0 16px 48px rgba(0, 0, 0, .6);
                color: #f2f2f5;
            }

            .hll-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 16px 18px;
                border-bottom: 1px solid rgba(255, 255, 255, .1);
            }

            .hll-modal-header h3 {
                margin: 0;
                font-size: 17px;
            }

            .hll-modal-close {
                padding: 6px 12px;
                background: rgba(255, 255, 255, .08);
                border: 0;
                border-radius: 8px;
                color: inherit;
                font: inherit;
                cursor: pointer;
            }

            .hll-modal-body {
                padding: 6px 18px 16px;
                overflow-y: auto;
            }

            .hll-completion-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 12px 0;
                border-bottom: 1px solid rgba(255, 255, 255, .08);
            }

            .hll-completion-row:last-child {
                border-bottom: 0;
            }

            .hll-completion-row small {
                display: block;
                color: #9a9aa6;
            }

            .hll-completion-row a {
                color: #7fb4ff;
            }

            .hll-completion-remove {
                padding: 8px 14px;
                border: 0;
                border-radius: 8px;
                background: #ff6b6b;
                color: #0d0d0f;
                font: inherit;
                font-weight: 600;
                cursor: pointer;
            }

            .hll-completion-remove:disabled {
                opacity: .6;
                cursor: wait;
            }
        `;
        document.head.appendChild(style);
    }

    const overlay = document.createElement("div");
    overlay.id = "hll-completions-modal";
    overlay.className = "hll-modal-overlay";

    const box = document.createElement("div");
    box.className = "hll-modal-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");

    const header = document.createElement("div");
    header.className = "hll-modal-header";

    const heading = document.createElement("h3");
    heading.textContent = `Completions · ${level.name || "Level"}`;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "hll-modal-close";
    closeButton.textContent = "Close";

    header.append(heading, closeButton);

    const body = document.createElement("div");
    body.className = "hll-modal-body";
    body.textContent = "Loading...";

    box.append(header, body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function onKey(event) {
        if (event.key === "Escape") close();
    }

    function close() {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
    }

    closeButton.addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    overlay.addEventListener("click", event => {
        if (event.target === overlay) close();
    });

    const { data: completions, error } = await supabaseClient
        .from("completions")
        .select("id, user_id, submission_id, verified_at")
        .eq("level_id", level.id)
        .order("verified_at", { ascending: false });

    if (error) {
        console.error("Could not load completions:", error);
        body.textContent = getErrorMessage(error);
        return;
    }

    let remaining = (completions || []).length;

    function updateHeading() {
        heading.textContent =
            `Completions · ${level.name || "Level"} (${remaining})`;
    }

    function showEmpty() {
        body.textContent = "No verified completions for this level.";
    }

    updateHeading();

    if (!remaining) {
        showEmpty();
        return;
    }

    const userIds = [...new Set(completions.map(item => item.user_id))];

    const { data: profiles } = await supabaseClient
        .from("profiles")
        .select("id, username")
        .in("id", userIds);

    const names = Object.fromEntries(
        (profiles || []).map(profile => [profile.id, profile.username])
    );

    // Evidence links are optional: they only show if staff may read the submissions.
    const evidence = {};
    const submissionIds = completions
        .map(item => item.submission_id)
        .filter(Boolean);

    if (submissionIds.length) {
        const { data: submissions } = await supabaseClient
            .from("completion_submissions")
            .select("id, evidence_url")
            .in("id", submissionIds);

        (submissions || []).forEach(submission => {
            evidence[submission.id] = submission.evidence_url;
        });
    }

    body.textContent = "";

    completions.forEach(completion => {
        const row = document.createElement("div");
        row.className = "hll-completion-row";

        const info = document.createElement("div");

        const nameLink = document.createElement("a");
        nameLink.href = `profile.html?id=${encodeURIComponent(completion.user_id)}`;
        nameLink.textContent = names[completion.user_id] || "Player";

        const meta = document.createElement("small");
        meta.textContent = `Verified ${formatDate(completion.verified_at)}`;

        info.append(nameLink, meta);

        const evidenceUrl = evidence[completion.submission_id];

        if (evidenceUrl && validHttpUrl(evidenceUrl)) {
            const evidenceLink = document.createElement("a");
            evidenceLink.href = evidenceUrl;
            evidenceLink.target = "_blank";
            evidenceLink.rel = "noopener noreferrer";
            evidenceLink.textContent = "View evidence";

            const evidenceLine = document.createElement("small");
            evidenceLine.appendChild(evidenceLink);
            info.appendChild(evidenceLine);
        }

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "hll-completion-remove";
        removeButton.textContent = "Remove";

        removeButton.addEventListener("click", async () => {
            const playerName = names[completion.user_id] || "this player";

            if (!confirm(
                `Remove ${playerName}'s completion of "${level.name}"?\n\n` +
                "They lose the points for this level. They can submit evidence again later."
            )) return;

            removeButton.disabled = true;
            removeButton.textContent = "Removing...";

            const { error: removeError } = await supabaseClient.rpc(
                "staff_remove_completion",
                { p_completion_id: completion.id }
            );

            if (removeError) {
                console.error("Remove completion failed:", removeError);
                alert("Could not remove this completion:\n" + getErrorMessage(removeError));

                removeButton.disabled = false;
                removeButton.textContent = "Remove";
                return;
            }

            row.remove();
            remaining -= 1;
            updateHeading();

            if (remaining <= 0) showEmpty();
        });

        row.append(info, removeButton);
        body.appendChild(row);
    });
}

// Staff-only: right-click a level to move it up or down the list.
function setupLevelContextMenu(list, levels, staffInfo) {
    // Nothing to show a moderator who has neither permission.
    if (!staffCan(staffInfo, "manage_levels") && !staffCan(staffInfo, "remove_completions")) {
        return;
    }

    async function moveLevel(level, direction) {
        const { error } = await supabaseClient.rpc("staff_move_level", {
            p_level_id: level.id,
            p_direction: direction
        });

        if (error) {
            console.error("Move level failed:", error);
            alert("Could not move this level:\n" + getErrorMessage(error));
            return;
        }

        try {
            sessionStorage.setItem("hllScrollY", String(window.scrollY));
        } catch { /* storage unavailable */ }

        location.reload();
    }

    async function removeLevel(level) {
        if (!confirm(
            `Remove "${level.name}" (#${level.rank}) from the list?\n\n` +
            "Levels below it move up one place. You can restore it later " +
            "from the \"Removed levels\" panel under the list."
        )) return;

        const { error } = await supabaseClient.rpc("staff_remove_level", {
            p_level_id: level.id
        });

        if (error) {
            console.error("Remove level failed:", error);
            alert("Could not remove this level:\n" + getErrorMessage(error));
            return;
        }

        try {
            sessionStorage.setItem("hllScrollY", String(window.scrollY));
        } catch { /* storage unavailable */ }

        location.reload();
    }

    bindStaffContextMenu(
        list,
        ".hll-level-card",
        card => levels.find(level => String(level.id) === card.dataset.levelId) || null,
        level => ({
            title: `#${level.rank} ${level.name || "Level"}`,
            entries: [
                { label: "Move up", perm: "manage_levels", onClick: () => moveLevel(level, "up") },
                { label: "Move down", perm: "manage_levels", onClick: () => moveLevel(level, "down") },
                { label: "Completions…", perm: "remove_completions", onClick: () => openLevelCompletionsModal(level) },
                { label: "Remove level", perm: "manage_levels", danger: true, onClick: () => removeLevel(level) }
            ].filter(entry => staffCan(staffInfo, entry.perm))
        })
    );
}

// Staff-only panel under the list showing removed levels with a Restore button.
async function setupRemovedLevelsPanel(list, listType) {
    if (!list || document.getElementById("hll-removed-panel")) return;

    if (!document.getElementById("hll-removed-panel-styles")) {
        const style = document.createElement("style");
        style.id = "hll-removed-panel-styles";
        style.textContent = `
            .hll-removed-panel {
                margin: 24px 0;
                padding: 12px 16px;
                background: rgba(255, 255, 255, .04);
                border: 1px solid rgba(255, 255, 255, .12);
                border-radius: 10px;
            }

            .hll-removed-panel summary {
                cursor: pointer;
                font-weight: 600;
            }

            .hll-removed-body {
                margin-top: 12px;
            }

            .hll-removed-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 10px 0;
                border-top: 1px solid rgba(255, 255, 255, .08);
            }

            .hll-removed-row small {
                display: block;
                color: #9a9aa6;
            }

            .hll-removed-row button {
                padding: 8px 14px;
                border: 0;
                border-radius: 8px;
                background: #42d392;
                color: #0d0d0f;
                font: inherit;
                font-weight: 600;
                cursor: pointer;
            }

            .hll-removed-row button:disabled {
                opacity: .6;
                cursor: wait;
            }
        `;
        document.head.appendChild(style);
    }

    const panel = document.createElement("details");
    panel.id = "hll-removed-panel";
    panel.className = "hll-removed-panel";

    const summary = document.createElement("summary");
    summary.textContent = "Removed levels (staff only)";

    const body = document.createElement("div");
    body.className = "hll-removed-body";
    body.textContent = "Loading...";

    panel.append(summary, body);
    list.insertAdjacentElement("afterend", panel);

    const { data, error } = await supabaseClient.rpc("staff_list_removed_levels");

    if (error) {
        console.error("Removed levels failed to load:", error);

        body.textContent =
            /staff_list_removed_levels|function|schema cache/i.test(error.message || "")
                ? "Level removal is not installed in the database yet."
                : getErrorMessage(error);

        return;
    }

    const removed = (data || []).filter(level => level.list_type === listType);

    summary.textContent = `Removed levels (staff only) · ${removed.length}`;

    if (!removed.length) {
        body.textContent = "No removed levels in this list.";
        return;
    }

    body.textContent = "";

    removed.forEach(level => {
        const row = document.createElement("div");
        row.className = "hll-removed-row";

        const info = document.createElement("div");

        const name = document.createElement("strong");
        name.textContent = level.name || "Unnamed level";

        const meta = document.createElement("small");
        meta.textContent =
            `${level.creator || "Unknown creator"}` +
            (level.removed_rank ? ` · was #${level.removed_rank}` : "") +
            (level.removed_at ? ` · removed ${formatDate(level.removed_at)}` : "");

        info.append(name, meta);

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Restore";

        button.addEventListener("click", async () => {
            if (!confirm(
                `Restore "${level.name}"` +
                (level.removed_rank ? ` to #${level.removed_rank}` : "") +
                "?\n\nLevels at or below that position move down one place."
            )) return;

            button.disabled = true;
            button.textContent = "Restoring...";

            const { error: restoreError } = await supabaseClient.rpc(
                "staff_restore_level",
                { p_level_id: level.id }
            );

            if (restoreError) {
                console.error("Restore level failed:", restoreError);
                alert("Could not restore this level:\n" + getErrorMessage(restoreError));

                button.disabled = false;
                button.textContent = "Restore";
                return;
            }

            location.reload();
        });

        row.append(info, button);
        body.appendChild(row);
    });
}

// Staff-only right-click (or long-press) menu on the player leaderboard.
function setupPlayerContextMenu(list, players, staffInfo) {
    if (!list || list.dataset.hllStaffMenuBound === "true") return;

    list.dataset.hllStaffMenuBound = "true";

    if (!document.getElementById("hll-staff-submenu-styles")) {
        const style = document.createElement("style");
        style.id = "hll-staff-submenu-styles";
        style.textContent = `
            .hll-staff-menu .hll-staff-menu-sub-host {
                position: relative;
            }

            .hll-staff-menu .hll-staff-menu-sub-trigger {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .hll-staff-menu .hll-staff-menu-sub-host:hover > .hll-staff-menu-sub-trigger,
            .hll-staff-menu .hll-staff-menu-sub-host.open > .hll-staff-menu-sub-trigger {
                background: rgba(255, 255, 255, .08);
            }

            .hll-staff-menu .hll-staff-submenu {
                display: none;
                position: absolute;
                left: 100%;
                top: -6px;
                min-width: 190px;
                padding: 6px;
                background: #17171c;
                border: 1px solid rgba(255, 255, 255, .14);
                border-radius: 10px;
                box-shadow: 0 12px 32px rgba(0, 0, 0, .55);
            }

            .hll-staff-menu .hll-staff-menu-sub-host.flip > .hll-staff-submenu {
                left: auto;
                right: 100%;
            }

            .hll-staff-menu .hll-staff-menu-sub-host.up > .hll-staff-submenu {
                top: auto;
                bottom: -6px;
            }

            .hll-staff-menu .hll-staff-menu-sub-host:hover > .hll-staff-submenu,
            .hll-staff-menu .hll-staff-menu-sub-host.open > .hll-staff-submenu {
                display: block;
            }

            .hll-staff-menu .hll-staff-submenu button {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .hll-staff-menu .hll-staff-submenu button:disabled {
                opacity: .45;
                cursor: not-allowed;
            }

            .hll-staff-menu .hll-check {
                display: inline-block;
                width: 14px;
                color: #42d392;
                font-weight: 700;
            }
        `;
        document.head.appendChild(style);
    }

    if (!document.getElementById("hll-staff-menu-styles")) {
        const style = document.createElement("style");
        style.id = "hll-staff-menu-styles";
        style.textContent = `
            .hll-staff-menu {
                position: fixed;
                z-index: 9999;
                min-width: 230px;
                padding: 6px;
                background: #17171c;
                border: 1px solid rgba(255, 255, 255, .14);
                border-radius: 10px;
                box-shadow: 0 12px 32px rgba(0, 0, 0, .55);
                font-size: 14px;
            }

            .hll-staff-menu-title {
                padding: 6px 10px;
                color: #9a9aa6;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: .06em;
            }

            .hll-staff-menu button {
                display: block;
                width: 100%;
                padding: 9px 10px;
                background: none;
                border: 0;
                border-radius: 6px;
                color: #f2f2f5;
                text-align: left;
                font: inherit;
                cursor: pointer;
            }

            .hll-staff-menu button:hover {
                background: rgba(255, 255, 255, .08);
            }

            .hll-staff-menu button.danger {
                color: #ff6b6b;
            }
        `;
        document.head.appendChild(style);
    }

    let menu = null;

    function closeMenu() {
        if (menu) menu.remove();
        menu = null;
    }

    async function runStaffAction(functionName, args) {
        closeMenu();

        const { error } = await supabaseClient.rpc(functionName, args);

        if (error) {
            console.error("Staff action failed:", error);
            alert("Could not complete that action:\n" + getErrorMessage(error));
            return;
        }

        reloadPage();
    }

    function openMenu(x, y, player) {
        closeMenu();

        menu = document.createElement("div");
        menu.className = "hll-staff-menu";
        menu.setAttribute("role", "menu");

        const title = document.createElement("div");
        title.className = "hll-staff-menu-title";
        title.textContent = player.username || "Player";
        menu.appendChild(title);

        function addItem(label, handler, danger = false) {
            const item = document.createElement("button");
            item.type = "button";
            item.textContent = label;
            if (danger) item.className = "danger";
            item.addEventListener("click", handler);
            menu.appendChild(item);
        }

        addItem("View profile", () => {
            location.href = `profile.html?id=${encodeURIComponent(player.id)}`;
        });

        // Badges: hover (or tap) to open the list, then click a badge to give or remove it.
        const badgeHost = document.createElement("div");
        badgeHost.className = "hll-staff-menu-sub-host";

        const badgeTrigger = document.createElement("button");
        badgeTrigger.type = "button";
        badgeTrigger.className = "hll-staff-menu-sub-trigger";

        const triggerText = document.createElement("span");
        triggerText.textContent = "Badges";

        const triggerArrow = document.createElement("span");
        triggerArrow.setAttribute("aria-hidden", "true");
        triggerArrow.textContent = "›";

        badgeTrigger.append(triggerText, triggerArrow);

        const submenu = document.createElement("div");
        submenu.className = "hll-staff-submenu";
        submenu.setAttribute("role", "menu");

        const viewerIsAdmin = staffInfo?.role === "admin";

        BADGE_DEFS.forEach(def => {
            const has = (player.badges || []).includes(def.key);
            const adminOnly = def.key === "admin" || def.key === "moderator";

            const item = document.createElement("button");
            item.type = "button";
            item.disabled = adminOnly && !viewerIsAdmin;

            if (item.disabled) {
                item.title = "Only admins can give or remove this badge.";
            }

            const check = document.createElement("span");
            check.className = "hll-check";
            check.textContent = has ? "✓" : "";

            const text = document.createElement("span");
            text.textContent = def.label;

            item.append(check, text);

            item.addEventListener("click", () => {
                runStaffAction("staff_set_player_badge", {
                    p_user_id: player.id,
                    p_badge: def.key,
                    p_enabled: !has
                });
            });

            submenu.appendChild(item);
        });

        badgeTrigger.addEventListener("click", () => {
            badgeHost.classList.toggle("open");
        });

        badgeHost.append(badgeTrigger, submenu);
        menu.appendChild(badgeHost);

        addItem("Edit points…", () => {
            closeMenu();

            const input = prompt(
                `Set total points for ${player.username}.\n` +
                `From completions: ${player.basePoints}\n` +
                `Current total: ${player.points}`,
                String(player.points)
            );

            if (input === null) return;

            const total = Number(input);

            if (!Number.isInteger(total) || total < 0) {
                alert("Enter a whole number, 0 or higher.");
                return;
            }

            runStaffAction("staff_set_player_points", {
                p_user_id: player.id,
                p_adjustment: total - player.basePoints
            });
        });

        if (player.adjustment !== 0) {
            addItem("Reset to completion points", () => {
                if (!confirm(`Remove the manual adjustment for ${player.username}?`)) return;

                runStaffAction("staff_set_player_points", {
                    p_user_id: player.id,
                    p_adjustment: 0
                });
            });
        }

        if (player.hidden) {
            addItem("Restore to leaderboard", () => {
                runStaffAction("staff_set_player_hidden", {
                    p_user_id: player.id,
                    p_hidden: false
                });
            });
        } else {
            addItem("Remove from leaderboard", () => {
                if (!confirm(
                    `Remove ${player.username} from the leaderboard?\n` +
                    "Their account and completions are kept, and you can restore them later."
                )) return;

                runStaffAction("staff_set_player_hidden", {
                    p_user_id: player.id,
                    p_hidden: true
                });
            }, true);
        }

        document.body.appendChild(menu);

        const rect = menu.getBoundingClientRect();

        menu.style.left =
            Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + "px";

        menu.style.top =
            Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + "px";

        // Open the badge list to the left / upwards when there is no room.
        const host = menu.querySelector(".hll-staff-menu-sub-host");

        if (host) {
            const hostRect = host.getBoundingClientRect();

            if (hostRect.right + 200 > window.innerWidth) host.classList.add("flip");
            if (hostRect.top + 180 > window.innerHeight) host.classList.add("up");
        }
    }

    function playerFromEvent(event) {
        const card = event.target.closest?.(".hll-player-card");

        if (!card) return null;

        return players.find(
            player => String(player.id) === card.dataset.playerId
        ) || null;
    }

    list.addEventListener("contextmenu", event => {
        const player = playerFromEvent(event);

        if (!player) return;

        event.preventDefault();
        openMenu(event.clientX, event.clientY, player);
    });

    // Long-press for touch screens.
    let pressTimer = null;
    let longPressed = false;

    list.addEventListener("touchstart", event => {
        const player = playerFromEvent(event);

        if (!player) return;

        longPressed = false;

        const touch = event.touches[0];

        pressTimer = setTimeout(() => {
            longPressed = true;
            openMenu(touch.clientX, touch.clientY, player);
        }, 600);
    }, { passive: true });

    ["touchend", "touchmove", "touchcancel"].forEach(name => {
        list.addEventListener(name, () => clearTimeout(pressTimer), { passive: true });
    });

    list.addEventListener("click", event => {
        if (longPressed) {
            event.preventDefault();
            longPressed = false;
        }
    });

    document.addEventListener("click", event => {
        if (menu && !menu.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeMenu();
    });

    window.addEventListener("scroll", closeMenu, { passive: true });
    window.addEventListener("resize", closeMenu);
}

async function renderPlayersList() {
    const list = $("player-list");
    const count = $("player-count");
    const search = $("player-search");

    if (!list) return;

    showEmptyState(
        list,
        "Loading player rankings...",
        "Calculating points from verified completions."
    );

    const [
        profilesResult,
        levelsResult,
        completionsResult
    ] = await Promise.all([
        supabaseClient
            .from("profiles")
            .select("id, username, gd_username, points_adjustment, leaderboard_hidden")
            .order("username", { ascending: true }),

        supabaseClient
            .from("levels")
            .select("id, rank, list_type, status, points")
            .eq("status", "approved"),

        fetchAllRows(() =>
            supabaseClient
                .from("completions")
                .select("user_id, level_id")
                .order("id", { ascending: true })
        )
    ]);

    let profilesData = profilesResult.data;

    if (
        profilesResult.error &&
        /points_adjustment|leaderboard_hidden|column|schema cache/i.test(
            profilesResult.error.message || ""
        )
    ) {
        // The staff columns have not been added to the database yet.
        const fallbackProfiles = await supabaseClient
            .from("profiles")
            .select("id, username, gd_username")
            .order("username", { ascending: true });

        if (fallbackProfiles.error) {
            showEmptyState(
                list,
                "Could not load players",
                fallbackProfiles.error.message
            );
            return;
        }

        profilesData = fallbackProfiles.data;
    } else if (profilesResult.error) {
        showEmptyState(
            list,
            "Could not load players",
            profilesResult.error.message
        );
        return;
    }

    let isStaff = false;

    if (currentUser) {
        const { data: staffRow } = await supabaseClient
            .from("staff_members")
            .select("role")
            .eq("user_id", currentUser.id)
            .maybeSingle();

        isStaff =
            !!staffRow && ["admin", "moderator"].includes(staffRow.role);
    }

    let levelsData = levelsResult.data;

    if (
        levelsResult.error &&
        /points|column|schema cache/i.test(levelsResult.error.message || "")
    ) {
        const fallback = await supabaseClient
            .from("levels")
            .select("id, rank, list_type, status")
            .eq("status", "approved");

        if (fallback.error) {
            showEmptyState(list, "Could not load levels", fallback.error.message);
            return;
        }

        levelsData = (fallback.data || []).map(level => ({
            ...level,
            points: null
        }));
    } else if (levelsResult.error) {
        showEmptyState(
            list,
            "Could not calculate points",
            levelsResult.error.message
        );
        return;
    }

    if (completionsResult.error) {
        showEmptyState(
            list,
            "Could not load verified completions",
            completionsResult.error.message
        );
        return;
    }

    const levelPoints = new Map();

    for (const level of levelsData || []) {
        const points = calculateLevelPoints(
            level.rank,
            level.list_type,
            level.points
        );

        if (points > 0) {
            levelPoints.set(level.id, points);
        }
    }

    ensureBadgeStyles();

    const badgeMap = await fetchBadgeMap();

    const playerTotals = new Map();

    for (const profile of profilesData || []) {
        playerTotals.set(profile.id, {
            ...profile,
            badges: badgeMap.get(profile.id) || [],
            adjustment: Number(profile.points_adjustment) || 0,
            hidden: profile.leaderboard_hidden === true,
            points: 0,
            completions: 0
        });
    }

    const countedCompletions = new Set();

    for (const completion of completionsResult.data || []) {
        const player = playerTotals.get(completion.user_id);
        const points = levelPoints.get(completion.level_id);

        if (!player || points === undefined || points <= 0) {
            continue;
        }

        const key = `${completion.user_id}:${completion.level_id}`;

        if (countedCompletions.has(key)) continue;

        countedCompletions.add(key);

        player.points += points;
        player.completions += 1;
    }

    const players = [...playerTotals.values()]
        .map(player => ({
            ...player,
            basePoints: player.points,
            points: Math.max(0, player.points + player.adjustment)
        }))
        .filter(player => isStaff || !player.hidden)
        .sort((a, b) =>
        b.points - a.points ||
        b.completions - a.completions ||
        String(a.username || "").localeCompare(String(b.username || ""))
    );

    function render(items) {
        if (count) count.textContent = `${items.length} players`;

        if (!items.length) {
            showEmptyState(
                list,
                "No players found",
                "Create an account to join the HLL community."
            );
            return;
        }

        list.innerHTML = items.map((player, index) => {
            const position = index + 1;

            let rankClass = "";

            if (position === 1) rankClass = "rank-first";
            else if (position === 2) rankClass = "rank-second";
            else if (position === 3) rankClass = "rank-third";

            return `
                <a
                    class="ranking-item hll-player-card"
                    data-player-id="${escapeHTML(player.id)}"
                    href="profile.html?id=${encodeURIComponent(player.id)}"
                >
                    <span class="ranking-position ${rankClass}">
                        #${position}
                    </span>

                    <span class="ranking-details">
                        <span class="hll-name-line">
                            <strong>${escapeHTML(player.username || "Player")}</strong>
                            ${badgeChipsHTML(player.badges)}
                        </span>
                        <span>
                            ${player.completions}
                            verified level${player.completions === 1 ? "" : "s"}${player.hidden ? " · HIDDEN FROM LEADERBOARD" : ""}
                        </span>
                    </span>

                    <span class="hll-points-badge">
                        <strong>${Number(player.points).toLocaleString()}</strong>
                        <small>POINTS</small>
                    </span>

                    <span class="ranking-arrow" aria-hidden="true">›</span>
                </a>
            `;
        }).join("");
    }

    render(players);

    const playersStaffInfo = isStaff ? await getStaffInfo() : null;

    if (playersStaffInfo && staffCan(playersStaffInfo, "manage_players")) {
        setupPlayerContextMenu(list, players, playersStaffInfo);
    }

    try {
        const savedScroll = sessionStorage.getItem("hllScrollY");

        if (savedScroll !== null) {
            sessionStorage.removeItem("hllScrollY");
            window.scrollTo(0, Number(savedScroll) || 0);
        }
    } catch { /* storage unavailable */ }

    if (search && search.dataset.hllPlayersSearchBound !== "true") {
        search.dataset.hllPlayersSearchBound = "true";

        search.addEventListener("input", () => {
            const term = search.value.trim().toLowerCase();

            render(players.filter(player =>
                String(player.username || "").toLowerCase().includes(term) ||
                String(player.gd_username || "").toLowerCase().includes(term)
            ));
        });
    }
}


/* =========================================================
   10. LEVEL SUBMISSIONS
   ========================================================= */

function setupLevelSubmission() {
    const form = $("level-submit-form");

    if (!form || form.dataset.hllBound === "true") return;

    form.dataset.hllBound = "true";

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const message = $("submission-message");
        const button = form.querySelector('[type="submit"]');

        hideMessage(message);

        const user = await requireLogin();
        if (!user) return;

        const name = field("level-name")?.value.trim();
        const levelId = field("level-id")?.value.trim() || "";
        const creator = field("level-creator")?.value.trim() || "";
        const suggestedList = field("suggested-list")?.value;
        const reason = field("submission-reason")?.value.trim() || "";

        if (!name || !suggestedList) {
            showMessage(message, "Enter the level name and select a list.", "error");
            return;
        }

        // Only enforce the checkbox if it actually exists on the page.
        const confirmBox = $("submission-confirm");

        if (confirmBox && !confirmBox.checked) {
            showMessage(message, "Please confirm that your submission is accurate.", "error");
            return;
        }

        setLoading(button, true);

        try {
            const { error } = await supabaseClient
                .from("level_submissions")
                .insert({
                    submitted_by: user.id,
                    name,
                    level_id: levelId || null,
                    creator: creator || null,
                    suggested_list: suggestedList,
                    reason,
                    status: "pending"
                });

            if (error) throw error;

            form.reset();

            showMessage(
                message,
                "Level suggestion submitted! It is waiting for staff review.",
                "success"
            );
        } catch (error) {
            console.error("Level submission failed:", JSON.stringify(error, null, 2));
            showMessage(message, describeDbError(error), "error");
        } finally {
            setLoading(button, false);
        }
    });
}


/* =========================================================
   11. COMPLETION SUBMISSIONS
   ========================================================= */

async function populateCompletionLevels() {
    const select = $("completion-level");

    if (!select) return;

    const levels = await getApprovedLevels();

    if (levels === null) {
        select.innerHTML =
            '<option value="">Could not load ranked levels</option>';
        return;
    }

    select.innerHTML =
        '<option value="">Choose a ranked level</option>' +
        levels.map(level => `
            <option value="${escapeHTML(level.id)}">
                #${escapeHTML(level.rank ?? "—")} — ${escapeHTML(level.name)}
            </option>
        `).join("");

    const requested = getQueryParameter("level");

    if (requested) select.value = requested;
}

function setupCompletionSubmission() {
    const form = $("completion-form");

    if (!form || form.dataset.hllBound === "true") return;

    form.dataset.hllBound = "true";

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const message = $("completion-message");
        const button = form.querySelector('[type="submit"]');

        hideMessage(message);

        const user = await requireLogin();
        if (!user) return;

        // field() accepts either naming style, so it works with your HTML as-is.
        const levelId = field("completion-level")?.value;
        const gdUsername =
            field("gd-username", "completion-gd-username")?.value.trim();
        const evidenceUrl =
            field("evidence-url", "completion-evidence")?.value.trim();
        const notes = field("completion-notes")?.value.trim() || "";

        if (!levelId || !gdUsername || !evidenceUrl) {
            showMessage(message, "Complete all required fields.", "error");
            return;
        }

        if (!validHttpUrl(evidenceUrl)) {
            showMessage(message, "Enter a valid evidence URL (starting with https://).", "error");
            return;
        }

        const confirmBox = $("completion-confirm");

        if (confirmBox && !confirmBox.checked) {
            showMessage(message, "Please confirm that your evidence is genuine.", "error");
            return;
        }

        setLoading(button, true);

        let sentLevelId = levelId;

        try {
            sentLevelId = await resolveLevelUuid(levelId, field("completion-level"));

            if (!sentLevelId) {
                throw new Error(
                    "Could not find that level in the database. Refresh the page and pick it again."
                );
            }

            const { error } = await supabaseClient
                .from("completion_submissions")
                .insert({
                    submitted_by: user.id,
                    level_id: sentLevelId,
                    gd_username: gdUsername,
                    evidence_url: evidenceUrl,
                    notes,
                    status: "pending"
                });

            if (error) throw error;

            form.reset();
            await populateCompletionLevels();

            showMessage(
                message,
                "Evidence submitted! Points only count after staff verification.",
                "success"
            );
        } catch (error) {
            console.error("Completion submission failed:", JSON.stringify(error, null, 2));
            showMessage(
                message,
                describeDbError(error) + ` [level_id sent: ${sentLevelId}]`,
                "error"
            );
        } finally {
            setLoading(button, false);
        }
    });
}


/* =========================================================
   12. PLAYER PROFILE
   ========================================================= */

/* ---------- Player statistics ---------- */

function ensureStatsStyles() {
    if (document.getElementById("hll-stats-styles")) return;

    const style = document.createElement("style");
    style.id = "hll-stats-styles";
    style.textContent = `
        .hll-stats {
            margin: 24px 0;
        }

        .hll-stats > h2 {
            margin: 0 0 14px;
            font-size: 22px;
        }

        .hll-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
        }

        .hll-stats-tile,
        .hll-stats-card {
            padding: 14px 16px;
            background: rgba(255, 255, 255, .05);
            border: 1px solid rgba(255, 255, 255, .1);
            border-radius: 12px;
        }

        .hll-stats-tile small,
        .hll-stats-note {
            display: block;
            color: #9a9aa6;
            font-size: 13px;
        }

        .hll-stats-tile strong {
            display: block;
            margin: 4px 0;
            font-size: 26px;
            line-height: 1.1;
        }

        .hll-stats-tile a {
            color: #7fb4ff;
            text-decoration: none;
        }

        .hll-stats-charts {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 12px;
            margin-top: 12px;
        }

        .hll-stats-card {
            margin-top: 12px;
        }

        .hll-stats-charts .hll-stats-card {
            margin-top: 0;
        }

        .hll-stats-card h3 {
            margin: 0 0 4px;
            font-size: 16px;
        }

        .hll-stats-card summary {
            cursor: pointer;
            font-weight: 600;
        }

        .hll-stats-chart {
            display: block;
            width: 100%;
            height: auto;
            margin-top: 10px;
        }

        .hll-stats-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px solid rgba(255, 255, 255, .07);
        }

        .hll-stats-row:last-child {
            border-bottom: 0;
        }

        .hll-stats-row a {
            color: inherit;
            font-weight: 600;
            text-decoration: none;
        }

        .hll-stats-row small {
            display: block;
            color: #9a9aa6;
        }

        .hll-stats-gain {
            color: #42d392;
            font-weight: 600;
            white-space: nowrap;
        }
    `;
    document.head.appendChild(style);
}

// Step chart for a series of { date: Date, value: number }.
function buildStatsChart(series, { color, invertY = false, label }) {
    const NS = "http://www.w3.org/2000/svg";
    const W = 560;
    const H = 200;
    const left = 46;
    const right = 14;
    const top = 14;
    const bottom = 30;

    function make(name, attributes = {}) {
        const element = document.createElementNS(NS, name);

        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, String(value));
        });

        return element;
    }

    const svg = make("svg", {
        viewBox: `0 0 ${W} ${H}`,
        class: "hll-stats-chart",
        role: "img",
        "aria-label": label
    });

    const times = series.map(item => item.date.getTime());
    const minT = Math.min(...times);
    const maxT = Math.max(...times);

    let minV = Math.min(...series.map(item => item.value));
    let maxV = Math.max(...series.map(item => item.value));

    if (minV === maxV) {
        maxV += 1;
        minV = Math.max(invertY ? 1 : 0, minV - 1);
    }

    const x = time =>
        maxT === minT
            ? left + (W - left - right) / 2
            : left + ((time - minT) / (maxT - minT)) * (W - left - right);

    const y = value => {
        const ratio = (value - minV) / (maxV - minV);

        return invertY
            ? top + ratio * (H - top - bottom)
            : top + (1 - ratio) * (H - top - bottom);
    };

    // Horizontal grid lines with value labels
    [0, 0.5, 1].forEach(ratio => {
        const value = minV + ratio * (maxV - minV);
        const position = y(value);

        svg.appendChild(make("line", {
            x1: left,
            x2: W - right,
            y1: position,
            y2: position,
            stroke: "rgba(255,255,255,.1)"
        }));

        const text = make("text", {
            x: left - 6,
            y: position + 4,
            "text-anchor": "end",
            "font-size": 11,
            fill: "#9a9aa6"
        });

        text.textContent = String(Math.round(value));
        svg.appendChild(text);
    });

    // Date labels
    const firstLabel = make("text", {
        x: left,
        y: H - 8,
        "font-size": 11,
        fill: "#9a9aa6"
    });

    firstLabel.textContent = formatDate(series[0].date);
    svg.appendChild(firstLabel);

    if (maxT !== minT) {
        const lastLabel = make("text", {
            x: W - right,
            y: H - 8,
            "text-anchor": "end",
            "font-size": 11,
            fill: "#9a9aa6"
        });

        lastLabel.textContent = formatDate(series[series.length - 1].date);
        svg.appendChild(lastLabel);
    }

    // Step line: a value holds until the next change
    let path = "";

    series.forEach((item, index) => {
        const px = x(item.date.getTime());
        const py = y(item.value);

        path += index === 0
            ? `M${px},${py}`
            : ` L${px},${y(series[index - 1].value)} L${px},${py}`;
    });

    svg.appendChild(make("path", {
        d: path,
        fill: "none",
        stroke: color,
        "stroke-width": 2,
        "stroke-linejoin": "round"
    }));

    // Dots with hover tooltips
    series.forEach((item, index) => {
        if (series.length > 80 && index !== series.length - 1) return;

        const dot = make("circle", {
            cx: x(item.date.getTime()),
            cy: y(item.value),
            r: 3.5,
            fill: color
        });

        const title = document.createElementNS(NS, "title");
        title.textContent = `${formatDate(item.date)} · ${item.value}`;

        dot.appendChild(title);
        svg.appendChild(dot);
    });

    return svg;
}

async function renderPlayerStatistics(profile, { actions, rank, points, completionList } = {}) {
    ensureStatsStyles();

    document.getElementById("hll-stats")?.remove();

    const panel = document.createElement("section");
    panel.id = "hll-stats";
    panel.className = "hll-stats";

    const title = document.createElement("h2");
    title.textContent = `${profile.username || "Player"}'s Statistics`;

    const body = document.createElement("div");
    body.textContent = "Loading statistics...";

    panel.append(title, body);

    if (actions) {
        actions.insertAdjacentElement("afterend", panel);
    } else if (completionList) {
        completionList.insertAdjacentElement("beforebegin", panel);
    } else {
        return;
    }

    try {
        const [profilesResult, levelsResult, completionsResult] = await Promise.all([
            fetchAllRows(() =>
                supabaseClient
                    .from("profiles")
                    .select("id, username, points_adjustment, leaderboard_hidden")
                    .order("id", { ascending: true })
            ),
            fetchAllRows(() =>
                supabaseClient
                    .from("levels")
                    .select("id, name, rank, list_type, points")
                    .eq("status", "approved")
                    .order("id", { ascending: true })
            ),
            fetchAllRows(() =>
                supabaseClient
                    .from("completions")
                    .select("user_id, level_id, verified_at")
                    .order("id", { ascending: true })
            )
        ]);

        let profilesData = profilesResult.data;
        let levelsData = levelsResult.data;

        // Older databases may not have the newer columns yet.
        if (profilesResult.error) {
            const retry = await fetchAllRows(() =>
                supabaseClient
                    .from("profiles")
                    .select("id, username")
                    .order("id", { ascending: true })
            );

            if (retry.error) throw retry.error;
            profilesData = retry.data;
        }

        if (levelsResult.error) {
            const retry = await fetchAllRows(() =>
                supabaseClient
                    .from("levels")
                    .select("id, name, rank, list_type")
                    .eq("status", "approved")
                    .order("id", { ascending: true })
            );

            if (retry.error) throw retry.error;
            levelsData = retry.data;
        }

        if (completionsResult.error) throw completionsResult.error;

        const levelInfo = new Map();

        for (const level of levelsData || []) {
            levelInfo.set(level.id, {
                ...level,
                value: calculateLevelPoints(level.rank, level.list_type, level.points)
            });
        }

        const people = new Map();

        for (const person of profilesData || []) {
            people.set(person.id, {
                id: person.id,
                username: person.username,
                adjustment: Number(person.points_adjustment) || 0,
                hidden: person.leaderboard_hidden === true,
                points: 0,
                completions: 0
            });
        }

        const target = people.get(profile.id);

        if (!target) throw new Error("Player not found.");

        // Valid, de-duplicated completions in date order
        const timeOf = completion =>
            completion.verified_at ? new Date(completion.verified_at).getTime() : 0;

        const ordered = [...(completionsResult.data || [])]
            .sort((a, b) => timeOf(a) - timeOf(b));

        const seen = new Set();
        const events = [];

        for (const completion of ordered) {
            const person = people.get(completion.user_id);
            const level = levelInfo.get(completion.level_id);

            if (!person || !level || level.value <= 0) continue;

            const key = `${completion.user_id}:${completion.level_id}`;

            if (seen.has(key)) continue;

            seen.add(key);

            person.points += level.value;
            person.completions += 1;

            events.push({
                userId: completion.user_id,
                level,
                date: completion.verified_at ? new Date(completion.verified_at) : null
            });
        }

        // Current leaderboard position (same ordering as the Players page)
        const leaderboard = [...people.values()]
            .filter(person => !person.hidden)
            .map(person => ({
                ...person,
                total: Math.max(0, person.points + person.adjustment)
            }))
            .sort((a, b) =>
                b.total - a.total ||
                b.completions - a.completions ||
                String(a.username || "").localeCompare(String(b.username || ""))
            );

        const position = leaderboard.findIndex(person => person.id === profile.id) + 1;
        const total = Math.max(0, target.points + target.adjustment);

        const positionText = target.hidden ? "Hidden" : position ? `#${position}` : "—";

        if (rank) rank.textContent = positionText;
        if (points) points.textContent = total.toLocaleString();

        // This player's own history
        const mine = events.filter(event => event.userId === profile.id);
        const mainCount = mine.filter(event => event.level.list_type === "main").length;
        const extendedCount = mine.filter(event => event.level.list_type === "extended").length;

        const best = mine.reduce((current, event) =>
            !current || Number(event.level.rank) < Number(current.level.rank)
                ? event
                : current,
            null
        );

        // Points over time
        let running = 0;
        const pointsSeries = [];

        for (const event of mine) {
            running += event.level.value;

            if (event.date) {
                pointsSeries.push({
                    date: event.date,
                    value: Math.max(0, running + target.adjustment)
                });
            }
        }

        // Leaderboard position over time, using today's point values
        const runningTotals = new Map();
        const rankSeries = [];

        for (const event of events) {
            runningTotals.set(
                event.userId,
                (runningTotals.get(event.userId) || 0) + event.level.value
            );

            if (event.userId !== profile.id || !event.date || target.hidden) continue;

            const mineTotal = Math.max(
                0,
                runningTotals.get(profile.id) + target.adjustment
            );

            let ahead = 0;

            for (const person of people.values()) {
                if (person.id === profile.id || person.hidden) continue;

                const personTotal = Math.max(
                    0,
                    (runningTotals.get(person.id) || 0) + person.adjustment
                );

                if (personTotal > mineTotal) ahead += 1;
            }

            rankSeries.push({ date: event.date, value: ahead + 1 });
        }

        if (rankSeries.length && position) {
            rankSeries[rankSeries.length - 1].value = position;
        }

        // Last 30 days
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recentEvents = mine.filter(event => event.date && event.date.getTime() >= cutoff);
        const recentPoints = recentEvents.reduce((sum, event) => sum + event.level.value, 0);

        body.textContent = "";

        // Summary tiles
        const grid = document.createElement("div");
        grid.className = "hll-stats-grid";

        function addTile(label, value, sub) {
            const tile = document.createElement("div");
            tile.className = "hll-stats-tile";

            const labelElement = document.createElement("small");
            labelElement.textContent = label;

            const valueElement = document.createElement("strong");
            valueElement.textContent = String(value);

            tile.append(labelElement, valueElement);

            if (sub instanceof Node) {
                const subElement = document.createElement("small");
                subElement.appendChild(sub);
                tile.appendChild(subElement);
            } else if (sub) {
                const subElement = document.createElement("small");
                subElement.textContent = sub;
                tile.appendChild(subElement);
            }

            grid.appendChild(tile);
        }

        addTile(
            "Players Rank",
            positionText,
            target.hidden
                ? "Removed from the leaderboard"
                : leaderboard.length ? `of ${leaderboard.length} players` : ""
        );

        addTile("Total Points", total.toLocaleString(), "");
        addTile("Main List Completions", mainCount, "");
        addTile("Extended List Completions", extendedCount, "");
        addTile("Total Completions", mine.length, "");

        let bestSub = "No completions yet";

        if (best) {
            bestSub = document.createElement("a");
            bestSub.href = `level.html?id=${encodeURIComponent(best.level.id)}`;
            bestSub.textContent = best.level.name || "Unnamed level";
        }

        addTile("Highest Completion", best ? `#${best.level.rank}` : "—", bestSub);

        body.appendChild(grid);

        // Charts: how the statistics change over time
        const charts = document.createElement("div");
        charts.className = "hll-stats-charts";

        function addChartCard(heading, note, series, options) {
            const card = document.createElement("div");
            card.className = "hll-stats-card";

            const headingElement = document.createElement("h3");
            headingElement.textContent = heading;

            const noteElement = document.createElement("span");
            noteElement.className = "hll-stats-note";
            noteElement.textContent = note;

            card.append(headingElement, noteElement);

            if (series.length >= 2) {
                card.appendChild(buildStatsChart(series, options));
            } else {
                const empty = document.createElement("p");
                empty.className = "hll-stats-note";
                empty.textContent = "Not enough history yet. This fills in as more levels are completed.";
                card.appendChild(empty);
            }

            charts.appendChild(card);
        }

        addChartCard(
            "Points over time",
            recentEvents.length
                ? `Last 30 days: +${recentPoints.toLocaleString()} points from ${recentEvents.length} completion${recentEvents.length === 1 ? "" : "s"}`
                : "No completions in the last 30 days",
            pointsSeries,
            { color: "#42d392", label: `${profile.username || "Player"}'s points over time` }
        );

        addChartCard(
            "Leaderboard position over time",
            "Lower is better. Based on today's level point values.",
            rankSeries,
            {
                color: "#7fb4ff",
                invertY: true,
                label: `${profile.username || "Player"}'s leaderboard position over time`
            }
        );

        body.appendChild(charts);

        // Completions with dates
        function buildRow(event) {
            const row = document.createElement("div");
            row.className = "hll-stats-row";

            const info = document.createElement("div");

            const link = document.createElement("a");
            link.href = `level.html?id=${encodeURIComponent(event.level.id)}`;
            link.textContent = event.level.name || "Unnamed level";

            const meta = document.createElement("small");
            meta.textContent =
                `#${event.level.rank} · ${event.level.list_type === "main" ? "Main List" : "Extended List"}` +
                ` · ${event.date ? formatDate(event.date) : "Unknown date"}`;

            info.append(link, meta);

            const gain = document.createElement("span");
            gain.className = "hll-stats-gain";
            gain.textContent = `+${event.level.value.toLocaleString()}`;

            row.append(info, gain);

            return row;
        }

        const newestFirst = [...mine].reverse();

        const recentCard = document.createElement("div");
        recentCard.className = "hll-stats-card";

        const recentHeading = document.createElement("h3");
        recentHeading.textContent = "Recent completions";
        recentCard.appendChild(recentHeading);

        if (!newestFirst.length) {
            const empty = document.createElement("p");
            empty.className = "hll-stats-note";
            empty.textContent = "No verified completions yet.";
            recentCard.appendChild(empty);
        } else {
            newestFirst.slice(0, 5).forEach(event => {
                recentCard.appendChild(buildRow(event));
            });
        }

        body.appendChild(recentCard);

        if (newestFirst.length > 5) {
            const history = document.createElement("details");
            history.className = "hll-stats-card";

            const summary = document.createElement("summary");
            summary.textContent = `Full completion history (${newestFirst.length})`;
            history.appendChild(summary);

            newestFirst.forEach(event => {
                history.appendChild(buildRow(event));
            });

            body.appendChild(history);
        }
    } catch (error) {
        console.error("Could not load player statistics:", error);

        body.textContent = "Statistics could not be loaded right now.";

        if (rank) rank.textContent = "—";
        if (points) points.textContent = "—";
    }
}

async function renderProfile() {
    const heading = $("profile-heading");
    const description = $("profile-description");
    const actions = $("profile-actions");
    const rank = $("profile-rank");
    const points = $("profile-points");
    const completionsCount = $("profile-completions");
    const completionList = $("profile-completion-list");

    if (!heading) return;

    const profileId = getQueryParameter("id") || currentUser?.id;

    if (!profileId) {
        heading.textContent = "Player not found";

        if (description) {
            description.textContent = "Log in or select a player profile.";
        }

        if (actions) {
            actions.innerHTML = `
                <a class="button button-primary" href="login.html">Sign In</a>
                <a class="button button-secondary" href="players.html">Player Leaderboard</a>
            `;
        }

        return;
    }

    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select(`
            id, username, bio, gd_username, avatar_url, created_at,
            show_bio, show_gd_username, show_avatar
        `)
        .eq("id", profileId)
        .maybeSingle();

    if (error || !profile) {
        heading.textContent = "Player not found";

        if (description) {
            description.textContent =
                "This profile may not exist or may not be publicly accessible.";
        }

        return;
    }

    heading.textContent = profile.username || "Player";

    ensureBadgeStyles();

    const profileBadges = (await fetchBadgeMap(profile.id)).get(profile.id) || [];

    if (profileBadges.length) {
        heading.append(" ");

        const holder = document.createElement("span");
        holder.innerHTML = badgeChipsHTML(profileBadges);

        heading.append(...holder.childNodes);
    }

    if (description) {
        description.textContent = profile.show_bio === false
            ? "This player has hidden their biography."
            : (profile.bio || "No biography yet.");
    }

    const own = currentUser?.id === profile.id;

    if (actions) {
        actions.innerHTML = own
            ? `
                <a class="button button-primary" href="settings.html">Edit profile</a>
                <a class="button button-secondary" href="completion.html">Submit a Completion</a>
            `
            : `
                <a class="button button-secondary" href="players.html">Player Leaderboard</a>
            `;
    }

    if ($("profile-gd-username")) {
        $("profile-gd-username").textContent =
            profile.show_gd_username === false
                ? "Hidden"
                : (profile.gd_username || "Not provided");
    }

    if ($("profile-avatar")) {
        const avatar = $("profile-avatar");

        if (
            profile.show_avatar !== false &&
            profile.avatar_url &&
            validHttpUrl(profile.avatar_url)
        ) {
            avatar.src = profile.avatar_url;
            avatar.hidden = false;
        } else {
            avatar.removeAttribute("src");
            avatar.hidden = true;
        }
    }

    await renderPlayerStatistics(profile, {
        actions,
        rank,
        points,
        completionList
    });

    const { data: completions, error: completionError } =
        await supabaseClient
            .from("completions")
            .select("id, level_id, verified_at")
            .eq("user_id", profile.id)
            .order("verified_at", { ascending: false });

    if (completionError) {
        showEmptyState(
            completionList,
            "Could not load completions",
            "Please try again later."
        );
        return;
    }

    const verified = completions || [];

    if (completionsCount) {
        completionsCount.textContent = String(verified.length);
    }

    if (!completionList) return;

    if (!verified.length) {
        showEmptyState(
            completionList,
            "No verified completions",
            "Verified level completions will appear here."
        );
        return;
    }

    const ids = verified.map(completion => completion.level_id);

    const { data: levels, error: levelError } =
        await supabaseClient
            .from("levels")
            .select("id, name, rank, list_type")
            .in("id", ids);

    if (levelError) {
        showEmptyState(
            completionList,
            "Could not load level details",
            "Please try again later."
        );
        return;
    }

    const byId = Object.fromEntries(
        (levels || []).map(level => [level.id, level])
    );

    const html = verified.map(completion => {
        const level = byId[completion.level_id];

        if (!level) return "";

        return `
            <a class="ranking-item" href="level.html?id=${encodeURIComponent(level.id)}">
                <span class="ranking-position">#${escapeHTML(level.rank ?? "—")}</span>
                <span class="ranking-details">
                    <strong>${escapeHTML(level.name || "Unnamed level")}</strong>
                    <span>Verified ${escapeHTML(formatDate(completion.verified_at))}</span>
                </span>
            </a>
        `;
    }).filter(Boolean).join("");

    if (html) {
        completionList.innerHTML = html;
    } else {
        showEmptyState(
            completionList,
            "No verified completions",
            "Verified level completions will appear here."
        );
    }
}


/* =========================================================
   13. LEVEL DETAILS
   ========================================================= */

async function renderLevelDetail() {
    const title = $("level-title");

    if (!title) return;

    const id = getQueryParameter("id");

    if (!id) {
        title.textContent = "Level not found";
        return;
    }

    let { data: level, error } = await supabaseClient
        .from("levels")
        .select("*")
        .eq("id", id)
        .eq("status", "approved")
        .maybeSingle();

    if (
        error &&
        /points|column|schema cache/i.test(error.message || "")
    ) {
        const retry = await supabaseClient
            .from("levels")
            .select("id, name, level_id, creator, list_type, rank, description, status")
            .eq("id", id)
            .eq("status", "approved")
            .maybeSingle();

        level = retry.data;
        error = retry.error;
    }

    if (error || !level) {
        title.textContent = "Level not found";

        if (error) console.error("Level detail loading failed:", error);

        return;
    }

    title.textContent = level.name || "Unnamed level";

    if ($("level-list-type")) {
        $("level-list-type").textContent =
            level.list_type === "main" ? "Main List" : "Extended List";
    }

    if ($("level-description")) {
        $("level-description").textContent =
            level.description || "No description provided.";
    }

    if ($("level-rank")) {
        $("level-rank").textContent = `#${level.rank ?? "—"}`;
    }

    if ($("level-points")) {
        const points = calculateLevelPoints(
            level.rank,
            level.list_type,
            level.points
        );

        $("level-points").textContent =
            `${Number(points).toLocaleString()} points`;
    }

    if ($("level-detail-name")) {
        $("level-detail-name").textContent = level.name || "Unnamed level";
    }

    if ($("level-creator")) {
        $("level-creator").textContent = level.creator || "Unknown";
    }

    if ($("level-id")) {
        $("level-id").textContent = level.level_id || "Not provided";
    }

    if ($("level-status")) {
        $("level-status").textContent = "Approved";
    }

    if ($("level-completion-count")) {
        $("level-completion-count").textContent = "Loading...";
    }

    const list = $("level-completions");

    const { data: completions, error: completionError } =
        await supabaseClient
            .from("completions")
            .select("id, user_id, verified_at")
            .eq("level_id", level.id)
            .order("verified_at", { ascending: false });

    if (completionError) {
        showEmptyState(
            list,
            "Could not load completions",
            "Please try again later."
        );
        return;
    }

    const verified = completions || [];

    if ($("level-completion-count")) {
        $("level-completion-count").textContent = String(verified.length);
    }

    if (!list) return;

    if (!verified.length) {
        showEmptyState(
            list,
            "No verified completions yet",
            "Verified completions will appear here."
        );
        return;
    }

    const userIds = [
        ...new Set(verified.map(completion => completion.user_id))
    ];

    const { data: profiles, error: profileError } =
        await supabaseClient
            .from("profiles")
            .select("id, username")
            .in("id", userIds);

    if (profileError) {
        showEmptyState(
            list,
            "Could not load player names",
            "Please try again later."
        );
        return;
    }

    const names = Object.fromEntries(
        (profiles || []).map(profile => [profile.id, profile.username])
    );

    list.innerHTML = verified.map(completion => `
        <a class="ranking-item"
           href="profile.html?id=${encodeURIComponent(completion.user_id)}">
            <span class="ranking-details">
                <strong>${escapeHTML(names[completion.user_id] || "Player")}</strong>
                <span>Verified ${escapeHTML(formatDate(completion.verified_at))}</span>
            </span>
        </a>
    `).join("");
}


/* =========================================================
   14. ACCOUNT SETTINGS
   ========================================================= */

async function setupSettings() {
    const form = $("profile-settings-form");

    if (!form) return;

    const message = $("settings-message");
    const user = await requireLogin();

    if (!user) return;

    if ($("settings-current-email")) {
        $("settings-current-email").textContent =
            user.email || "No email available";
    }

    let profile = currentProfile;

    if (!profile || profile.id !== user.id) {
        const result = await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

        if (result.error) {
            showMessage(message, getErrorMessage(result.error), "error");
            return;
        }

        profile = result.data;
    }

    if (!profile) {
        showMessage(
            message,
            "Your profile could not be loaded. Please log out and back in.",
            "error"
        );
        return;
    }

    currentProfile = profile;

    if ($("settings-username")) {
        $("settings-username").value = profile.username || "";
    }

    if ($("settings-bio")) {
        $("settings-bio").value = profile.bio || "";
    }

    if ($("settings-gd-username")) {
        $("settings-gd-username").value = profile.gd_username || "";
    }

    if ($("settings-avatar")) {
        $("settings-avatar").value = profile.avatar_url || "";
    }

    if ($("privacy-show-bio")) {
        $("privacy-show-bio").checked = profile.show_bio !== false;
    }

    if ($("privacy-show-gd-username")) {
        $("privacy-show-gd-username").checked =
            profile.show_gd_username !== false;
    }

    if ($("privacy-show-avatar")) {
        $("privacy-show-avatar").checked = profile.show_avatar !== false;
    }

    if (form.dataset.hllSettingsBound === "true") return;

    form.dataset.hllSettingsBound = "true";

    // SAVE PROFILE

    form.addEventListener("submit", async event => {
        event.preventDefault();

        hideMessage(message);

        const button = form.querySelector('[type="submit"]');

        const username = $("settings-username")?.value.trim() || "";
        const bio = $("settings-bio")?.value.trim() || "";
        const gd = $("settings-gd-username")?.value.trim() || "";
        const avatar = $("settings-avatar")?.value.trim() || "";

        if (username.length < 3 || username.length > 24) {
            showMessage(message, "Your username must be between 3 and 24 characters.", "error");
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            showMessage(message, "Use only letters, numbers, underscores, and hyphens in your username.", "error");
            return;
        }

        if (bio.length > 300 || gd.length > 40) {
            showMessage(message, "Your bio must be 300 characters or less, and your GD username 40 characters or less.", "error");
            return;
        }

        if (avatar && !validHttpUrl(avatar)) {
            showMessage(message, "Enter a valid avatar URL beginning with https:// or http://.", "error");
            return;
        }

        setLoading(button, true);

        try {
            const { data, error } = await supabaseClient
                .from("profiles")
                .update({
                    username,
                    bio,
                    gd_username: gd,
                    avatar_url: avatar || null
                })
                .eq("id", user.id)
                .select()
                .single();

            if (error) throw error;

            currentProfile = { ...currentProfile, ...data };

            showMessage(message, "Profile settings saved successfully!", "success");
        } catch (error) {
            showMessage(message, getErrorMessage(error), "error");
        } finally {
            setLoading(button, false);
        }
    });

    // CHANGE EMAIL

    const emailForm = $("email-settings-form");

    if (emailForm && emailForm.dataset.hllBound !== "true") {
        emailForm.dataset.hllBound = "true";

        emailForm.addEventListener("submit", async event => {
            event.preventDefault();

            const msg = $("email-settings-message");
            const button = emailForm.querySelector('[type="submit"]');
            const email = $("settings-new-email")?.value.trim() || "";

            hideMessage(msg);

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showMessage(msg, "Enter a valid email address.", "error");
                return;
            }

            if (email.toLowerCase() === (user.email || "").toLowerCase()) {
                showMessage(msg, "That is already your current email address.", "error");
                return;
            }

            setLoading(button, true);

            try {
                const redirectTo = new URL("login.html", location.href).href;

                const { error } = await supabaseClient.auth.updateUser(
                    { email },
                    { emailRedirectTo: redirectTo }
                );

                if (error) throw error;

                emailForm.reset();

                showMessage(
                    msg,
                    "Email change requested. Follow the verification instructions sent by Supabase.",
                    "success"
                );
            } catch (error) {
                showMessage(msg, getErrorMessage(error), "error");
            } finally {
                setLoading(button, false);
            }
        });
    }

    // CHANGE PASSWORD

    const passwordForm = $("password-change-form");

    if (passwordForm && passwordForm.dataset.hllBound !== "true") {
        passwordForm.dataset.hllBound = "true";

        passwordForm.addEventListener("submit", async event => {
            event.preventDefault();

            const msg = $("password-change-message");
            const button = passwordForm.querySelector('[type="submit"]');

            const password = $("settings-new-password")?.value || "";
            const confirmPassword = $("settings-confirm-password")?.value || "";

            hideMessage(msg);

            if (password.length < 8) {
                showMessage(msg, "Your password must contain at least 8 characters.", "error");
                return;
            }

            if (password !== confirmPassword) {
                showMessage(msg, "The passwords do not match.", "error");
                return;
            }

            setLoading(button, true);

            try {
                const { error } = await supabaseClient.auth.updateUser({
                    password
                });

                if (error) throw error;

                passwordForm.reset();

                showMessage(msg, "Your password has been updated successfully.", "success");
            } catch (error) {
                showMessage(msg, getErrorMessage(error), "error");
            } finally {
                setLoading(button, false);
            }
        });
    }

    // PASSWORD RECOVERY EMAIL

    const resetButton = $("password-reset-button");

    if (resetButton && resetButton.dataset.hllBound !== "true") {
        resetButton.dataset.hllBound = "true";

        resetButton.addEventListener("click", async () => {
            const msg = $("password-reset-message");

            hideMessage(msg);

            if (!user.email) {
                showMessage(msg, "No email address is associated with this account.", "error");
                return;
            }

            setLoading(resetButton, true);

            try {
                const redirectTo = new URL("login.html", location.href).href;

                const { error } =
                    await supabaseClient.auth.resetPasswordForEmail(
                        user.email,
                        { redirectTo }
                    );

                if (error) throw error;

                showMessage(
                    msg,
                    "If password recovery is enabled, check your email for the reset link.",
                    "success"
                );
            } catch (error) {
                showMessage(msg, getErrorMessage(error), "error");
            } finally {
                setLoading(resetButton, false);
            }
        });
    }

    // PRIVACY SETTINGS

    const privacyForm = $("privacy-settings-form");

    if (privacyForm && privacyForm.dataset.hllBound !== "true") {
        privacyForm.dataset.hllBound = "true";

        privacyForm.addEventListener("submit", async event => {
            event.preventDefault();

            const msg = $("privacy-settings-message");
            const button = privacyForm.querySelector('[type="submit"]');

            hideMessage(msg);
            setLoading(button, true);

            try {
                const preferences = {
                    show_bio: $("privacy-show-bio")?.checked ?? true,
                    show_gd_username: $("privacy-show-gd-username")?.checked ?? true,
                    show_avatar: $("privacy-show-avatar")?.checked ?? true
                };

                const { data, error } = await supabaseClient
                    .from("profiles")
                    .update(preferences)
                    .eq("id", user.id)
                    .select()
                    .single();

                if (error) throw error;

                currentProfile = { ...currentProfile, ...data };

                showMessage(msg, "Privacy preferences saved successfully!", "success");
            } catch (error) {
                showMessage(
                    msg,
                    "Could not save privacy settings: " + getErrorMessage(error),
                    "error"
                );
            } finally {
                setLoading(button, false);
            }
        });
    }

    // LOG OUT

    const logoutButton = $("logout-button");

    if (logoutButton && logoutButton.dataset.hllSettingsLogoutBound !== "true") {
        logoutButton.dataset.hllSettingsLogoutBound = "true";

        logoutButton.addEventListener("click", async event => {
            event.preventDefault();

            if (confirm("Are you sure you want to log out?")) {
                await logout();
            }
        });
    }

    // DELETE ACCOUNT
    // Disabled until secure server-side deletion exists.

    const deleteButton = $("delete-account-button");

    if (deleteButton) {
        deleteButton.disabled = true;

        deleteButton.title =
            "Account deletion is unavailable until a secure server endpoint is deployed.";

        if (deleteButton.dataset.hllDeleteBound !== "true") {
            deleteButton.dataset.hllDeleteBound = "true";

            deleteButton.addEventListener("click", () => {
                showMessage(
                    $("delete-account-message"),
                    "Account deletion is not enabled yet. A secure server-side Supabase Edge Function must be deployed first. No account data has been deleted.",
                    "error"
                );
            });
        }
    }
}


/* =========================================================
   15. STAFF DASHBOARD (LEVEL + COMPLETION REVIEW)
   ========================================================= */

async function setupStaffDashboard() {
    const statusElement = $("staff-status");
    const levelQueue = $("staff-level-queue");
    const completionQueue = $("staff-completion-queue");
    const pendingLevelCount = $("pending-level-count");
    const pendingCompletionCount = $("pending-completion-count");

    if (!levelQueue || !completionQueue) return;

    levelQueue.innerHTML = "<p>Loading level submissions...</p>";
    completionQueue.innerHTML = "<p>Loading completion submissions...</p>";

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user) {
            throw new Error("Please log in before opening the staff dashboard.");
        }

        const { data: staff, error: staffError } = await supabaseClient
            .from("staff_members")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle();

        if (staffError) throw staffError;

        if (!staff || !["admin", "moderator"].includes(staff.role)) {
            throw new Error("Access denied. Staff authorization required.");
        }

        if (statusElement) {
            statusElement.textContent = `Staff access confirmed: ${staff.role}`;
        }

        await Promise.all([
            loadLevelSubmissionQueue(),
            loadCompletionSubmissionQueue()
        ]);
    } catch (error) {
        console.error("HLL staff dashboard error:", error);

        if (statusElement) {
            statusElement.textContent =
                error.message || "Could not load the staff dashboard.";
        }

        if (pendingLevelCount) pendingLevelCount.textContent = "—";
        if (pendingCompletionCount) pendingCompletionCount.textContent = "—";

        levelQueue.innerHTML = "<p>Could not load level submissions.</p>";
        completionQueue.innerHTML = "<p>Could not load completion submissions.</p>";
    }

    async function loadLevelSubmissionQueue() {
        const { data, error } = await supabaseClient
            .from("level_submissions")
            .select("*")
            .eq("status", "pending")
            .order("id", { ascending: true });

        if (error) throw error;

        const submissions = data || [];

        if (pendingLevelCount) {
            pendingLevelCount.textContent = String(submissions.length);
        }

        if (!submissions.length) {
            levelQueue.innerHTML = "<p>No pending level submissions.</p>";
            return;
        }

        levelQueue.innerHTML = "";

        submissions.forEach(submission => {
            const card = document.createElement("article");
            card.className = "staff-review-card";

            const title = document.createElement("h3");
            title.textContent = submission.name || "Untitled level";

            const details = document.createElement("p");
            details.textContent =
                `Game Level ID: ${submission.level_id || "Not provided"} | ` +
                `Creator: ${submission.creator || "Unknown"} | ` +
                `List: ${submission.suggested_list || "Unknown"}`;

            const reason = document.createElement("p");
            reason.textContent =
                `Reason: ${submission.reason || "No reason provided"}`;

            const actions = document.createElement("div");
            actions.className = "staff-review-actions";

            const approveButton = document.createElement("button");
            approveButton.type = "button";
            approveButton.textContent = "Approve";
            approveButton.className = "staff-approve-button";

            const rejectButton = document.createElement("button");
            rejectButton.type = "button";
            rejectButton.textContent = "Reject";
            rejectButton.className = "staff-reject-button";

            approveButton.addEventListener("click", async () => {
                const list = String(submission.suggested_list || "")
                    .trim()
                    .toLowerCase();

                if (list !== "main" && list !== "extended") {
                    alert("This submission has an invalid list type.");
                    return;
                }

                const rankInput = prompt(
                    list === "main"
                        ? "Enter the Main List rank (1–150):"
                        : "Enter the Extended List rank (151–350):"
                );

                if (rankInput === null) return;

                const rank = Number(rankInput);

                const validRank =
                    Number.isInteger(rank) &&
                    (list === "main"
                        ? rank >= 1 && rank <= 150
                        : rank >= 151 && rank <= 350);

                if (!validRank) {
                    alert("That rank is outside the allowed range for this list.");
                    return;
                }

                if (!confirm(
                    `Approve "${submission.name}" as ${list.toUpperCase()} rank #${rank}?`
                )) {
                    return;
                }

                approveButton.disabled = true;
                rejectButton.disabled = true;
                approveButton.textContent = "Approving...";

                try {
                    const { data, error } = await supabaseClient.rpc(
                        "review_level_submission",
                        {
                            p_submission_id: submission.id,
                            p_decision: "approved",
                            p_rank: rank
                        }
                    );

                    if (error) throw error;

                    if (data && data.success === false) {
                        throw new Error(data.message || "Approval failed.");
                    }

                    alert(
                        `Level approved!\nRank: #${rank}` +
                        (data?.points !== undefined ? `\nPoints: ${data.points}` : "")
                    );

                    await loadLevelSubmissionQueue();
                } catch (error) {
                    console.error("Level approval failed:", error);
                    alert(error.message || "Could not approve this submission.");

                    approveButton.disabled = false;
                    rejectButton.disabled = false;
                    approveButton.textContent = "Approve";
                }
            });

            rejectButton.addEventListener("click", async () => {
                if (!confirm(`Reject "${submission.name}"?`)) return;

                approveButton.disabled = true;
                rejectButton.disabled = true;
                rejectButton.textContent = "Rejecting...";

                try {
                    const { error } = await supabaseClient.rpc(
                        "review_level_submission",
                        {
                            p_submission_id: submission.id,
                            p_decision: "rejected",
                            p_rank: null
                        }
                    );

                    if (error) throw error;

                    alert("Submission rejected.");
                    await loadLevelSubmissionQueue();
                } catch (error) {
                    console.error("Level rejection failed:", error);
                    alert(error.message || "Could not reject this submission.");

                    approveButton.disabled = false;
                    rejectButton.disabled = false;
                    rejectButton.textContent = "Reject";
                }
            });

            actions.append(approveButton, rejectButton);
            card.append(title, details, reason, actions);
            levelQueue.appendChild(card);
        });
    }

    async function loadCompletionSubmissionQueue() {
        const { data, error } = await supabaseClient
            .from("completion_submissions")
            .select("*")
            .eq("status", "pending")
            .order("id", { ascending: true });

        if (error) throw error;

        const submissions = data || [];

        if (pendingCompletionCount) {
            pendingCompletionCount.textContent = String(submissions.length);
        }

        if (!submissions.length) {
            completionQueue.innerHTML = "<p>No pending completion submissions.</p>";
            return;
        }

        completionQueue.innerHTML = "";

        for (const submission of submissions) {
            const card = document.createElement("article");
            card.className = "staff-review-card";

            const title = document.createElement("h3");
            title.textContent = "Completion submission";

            const details = document.createElement("p");
            details.textContent =
                `Submission: ${submission.id} | ` +
                `User: ${submission.submitted_by || "Unknown"} | ` +
                `Level: ${submission.level_id || "Unknown"}`;

            const username = document.createElement("p");
            username.textContent =
                `GD Username: ${submission.gd_username || "Not provided"}`;

            const notes = document.createElement("p");
            notes.textContent =
                `Notes: ${submission.notes || "No notes provided"}`;

            const actions = document.createElement("div");
            actions.className = "staff-review-actions";

            if (submission.evidence_url && validHttpUrl(submission.evidence_url)) {
                const evidenceLink = document.createElement("a");
                evidenceLink.href = submission.evidence_url;
                evidenceLink.target = "_blank";
                evidenceLink.rel = "noopener noreferrer";
                evidenceLink.textContent = "View Evidence";
                actions.appendChild(evidenceLink);
            }

            const approveButton = document.createElement("button");
            approveButton.type = "button";
            approveButton.textContent = "Approve";
            approveButton.className = "staff-approve-button";

            const rejectButton = document.createElement("button");
            rejectButton.type = "button";
            rejectButton.textContent = "Reject";
            rejectButton.className = "staff-reject-button";

            async function reviewCompletion(decision) {
                approveButton.disabled = true;
                rejectButton.disabled = true;

                try {
                    const { error } = await supabaseClient.rpc(
                        "review_completion_submission",
                        {
                            p_submission_id: submission.id,
                            p_decision: decision
                        }
                    );

                    if (error) throw error;

                    alert(
                        decision === "approved"
                            ? "Completion approved."
                            : "Completion rejected."
                    );

                    await loadCompletionSubmissionQueue();
                } catch (error) {
                    console.error("Completion review failed:", error);
                    alert(error.message || "Could not review this completion.");

                    approveButton.disabled = false;
                    rejectButton.disabled = false;
                }
            }

            approveButton.addEventListener("click", () => {
                if (confirm("Approve this completion?")) {
                    reviewCompletion("approved");
                }
            });

            rejectButton.addEventListener("click", () => {
                if (confirm("Reject this completion?")) {
                    reviewCompletion("rejected");
                }
            });

            actions.append(approveButton, rejectButton);
            card.append(title, details, username, notes, actions);
            completionQueue.appendChild(card);
        }
    }
}


/* =========================================================
   16. START HLL
   ========================================================= */

async function startHLL() {
    try {
        await initializeSupabase();
        await loadCurrentUser();

        registerAuthListener();
        updateLoginButton();
        updateProfileSubmitButton();

        // Non-blocking: staff get one "Staff" tab with a hover dropdown.
        setupStaffMenu().catch(error => {
            console.warn("Staff menu unavailable:", error);
        });

        const page = pageName();

        switch (page) {
            case "login.html":
                setupAuthTabs();
                break;

            case "main-list.html":
                await renderLevelList("main");
                break;

            case "extended-list.html":
                await renderLevelList("extended");
                break;

            case "players.html":
                await renderPlayersList();
                break;

            case "submit.html":
                setupLevelSubmission();
                break;

            case "completion.html":
                // Bind the form first so it works even if the level list is slow.
                setupCompletionSubmission();
                await populateCompletionLevels();
                break;

            case "profile.html":
                await renderProfile();
                break;

            case "level.html":
                await renderLevelDetail();
                break;

            case "settings.html":
                await setupSettings();
                break;

            case "staff.html":
                await setupStaffDashboard();
                break;
        }

        const logoutButton = $("logout-button");

        if (
            logoutButton &&
            page !== "settings.html" &&
            logoutButton.dataset.hllLogoutBound !== "true"
        ) {
            logoutButton.dataset.hllLogoutBound = "true";

            logoutButton.addEventListener("click", async event => {
                event.preventDefault();
                await logout();
            });
        }

        console.log("HLL initialized successfully:", page);
    } catch (error) {
        console.error("HLL initialization failed:", error);

        const message =
            "HLL could not connect to Supabase. Check your internet connection and refresh.";

        if ($("settings-current-email")) {
            $("settings-current-email").textContent = "Could not load account";
        }

        if ($("settings-message")) {
            showMessage($("settings-message"), getErrorMessage(error), "error");
        } else if ($("auth-message")) {
            showMessage($("auth-message"), message, "error");
        } else if ($("submission-message")) {
            showMessage($("submission-message"), message, "error");
        } else if ($("completion-message")) {
            showMessage($("completion-message"), message, "error");
        } else if ($("list-count")) {
            $("list-count").textContent = message;
        } else if ($("ranking-list")) {
            showEmptyState($("ranking-list"), "Connection problem", message);
        }
    }
}

document.addEventListener("DOMContentLoaded", startHLL);
