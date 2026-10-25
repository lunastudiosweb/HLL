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

    if (await isCurrentUserStaff()) {
        setupLevelContextMenu(list, levels);
        await setupRemovedLevelsPanel(list, listType);
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

// Staff-only: right-click a level to move it up or down the list.
function setupLevelContextMenu(list, levels) {
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
                { label: "Move up", onClick: () => moveLevel(level, "up") },
                { label: "Move down", onClick: () => moveLevel(level, "down") },
                { label: "Remove level", danger: true, onClick: () => removeLevel(level) }
            ]
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
function setupPlayerContextMenu(list, players) {
    if (!list || list.dataset.hllStaffMenuBound === "true") return;

    list.dataset.hllStaffMenuBound = "true";

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

        location.reload();
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

        supabaseClient
            .from("completions")
            .select("user_id, level_id")
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

    const playerTotals = new Map();

    for (const profile of profilesData || []) {
        playerTotals.set(profile.id, {
            ...profile,
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
                        <strong>${escapeHTML(player.username || "Player")}</strong>
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

    if (isStaff) setupPlayerContextMenu(list, players);

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

    if (rank) rank.textContent = "—";
    if (points) points.textContent = "Not configured";

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
