/* =========================================================
   HLL — HARDEST LEVELS LIST
   Complete Main JavaScript
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

const pageName = () =>
    location.pathname.split("/").pop() || "index.html";

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
    if (!element) return;

    element.textContent = message;
    element.dataset.type = type;
    element.hidden = false;
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

    if (
        next.startsWith("/") &&
        !next.startsWith("//")
    ) {
        return next;
    }

    if (
        !next.includes(":") &&
        !next.startsWith("//")
    ) {
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
            existing.addEventListener("load", resolve, {
                once: true
            });

            existing.addEventListener("error", () => {
                reject(new Error("Could not load Supabase."));
            }, {
                once: true
            });

            return;
        }

        const script = document.createElement("script");

        script.src =
            "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.dataset.hllSupabase = "true";

        script.onload = resolve;

        script.onerror = () => {
            reject(
                new Error(
                    "Supabase could not load. Check your connection."
                )
            );
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

    console.warn(
        "Could not create profile:",
        insertError.message
    );

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
            loginTab.setAttribute(
                "aria-selected",
                String(!signingUp)
            );
        }

        if (signupTab) {
            signupTab.classList.toggle("active", signingUp);
            signupTab.setAttribute(
                "aria-selected",
                String(signingUp)
            );
        }

        if (username) {
            username.hidden = !signingUp;
            username.required = signingUp;
        }

        if (usernameHint) {
            usernameHint.hidden = !signingUp;
        }

        if (passwordHint) {
            passwordHint.hidden = !signingUp;
        }

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
                showMessage(
                    message,
                    "Enter your email and password.",
                    "error"
                );
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
                                data: {
                                    username: enteredUsername
                                }
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
                                }, {
                                    onConflict: "id"
                                });

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
                showMessage(
                    message,
                    getErrorMessage(error),
                    "error"
                );
            } finally {
                setLoading(button, false);
            }
        });
    }

    setMode(mode);
}


/* =========================================================
   6. APPROVED LEVEL LISTS
   ========================================================= */

async function getApprovedLevels(listType = null) {
    let query = supabaseClient
        .from("levels")
        .select(
            "id, name, level_id, creator, list_type, rank, description"
        )
        .eq("status", "approved")
        .order("rank", {
            ascending: true
        });

    if (listType) {
        query = query.eq("list_type", listType);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Level loading failed:", error.message);

        showEmptyState(
            $("ranking-list"),
            "Could not load levels",
            "Please refresh. If the problem continues, check the levels table and Supabase read policies."
        );

        return null;
    }

    return data || [];
}

async function renderLevelList(listType) {
    const list = $("ranking-list");
    const count = $("list-count");
    const search = $("level-search");

    if (!list) return;

    const isMainList = listType === "main";
    const minRank = isMainList ? 1 : 151;
    const maxRank = isMainList ? 150 : 350;
    const listName = isMainList ? "Main List" : "Extended List";

    showEmptyState(
        list,
        "Loading rankings...",
        `Fetching approved ${listName} levels from HLL.`
    );

    if (count) count.textContent = "Loading rankings...";

    const allLevels = await getApprovedLevels(listType);

    if (allLevels === null) {
        if (count) count.textContent = "Rankings could not be loaded.";
        return;
    }

    // Enforce the official rank range for this list.
    const levels = allLevels.filter(level => {
        const rank = Number(level.rank);

        return Number.isInteger(rank) &&
            rank >= minRank &&
            rank <= maxRank;
    });

    function render(items) {
        if (count) {
            count.textContent =
                `${items.length} ranked level${items.length === 1 ? "" : "s"} · Ranks #${minRank}–#${maxRank}`;
        }

        if (!items.length) {
            showEmptyState(
                list,
                "No ranked levels yet",
                `No approved levels with ranks #${minRank}–#${maxRank} are available in the ${listName}.`
            );
            return;
        }

        list.innerHTML = items.map(level => `
            <a class="ranking-item"
               href="level.html?id=${encodeURIComponent(level.id)}">

                <span class="ranking-position">
                    #${escapeHTML(level.rank)}
                </span>

                <span class="ranking-details">
                    <strong>${escapeHTML(level.name || "Unnamed level")}</strong>
                    <span>
                        ${escapeHTML(level.creator || "Unknown creator")}
                        ${level.level_id ? ` · GD ID: ${escapeHTML(level.level_id)}` : ""}
                    </span>
                </span>

                <span class="ranking-arrow" aria-hidden="true">›</span>
            </a>
        `).join("");
    }

    render(levels);

    if (search && search.dataset.hllBound !== "true") {
        search.dataset.hllBound = "true";

        search.addEventListener("input", () => {
            const term = search.value.trim().toLowerCase();

            const filtered = levels.filter(level =>
                String(level.name || "").toLowerCase().includes(term) ||
                String(level.creator || "").toLowerCase().includes(term) ||
                String(level.rank ?? "").includes(term) ||
                String(level.level_id || "").toLowerCase().includes(term)
            );

            render(filtered);
        });
    }
}


/* =========================================================
   7. PLAYER LEADERBOARD
   ========================================================= */

async function renderPlayersList() {
    const list = $("player-list");
    const count = $("player-count");
    const search = $("player-search");

    if (!list) return;

    showEmptyState(
        list,
        "Loading players...",
        "Fetching HLL player profiles."
    );

    const { data: profiles, error } = await supabaseClient
        .from("profiles")
        .select("id, username, gd_username, bio")
        .order("username", {
            ascending: true
        });

    if (error) {
        console.error(error.message);

        showEmptyState(
            list,
            "Could not load players",
            "Please refresh and try again."
        );
        return;
    }

    const result = await supabaseClient
        .from("completions")
        .select("user_id");

    if (result.error) {
        showEmptyState(
            list,
            "Could not load player statistics",
            "Please try again later."
        );
        return;
    }

    const counts = {};

    for (const item of result.data || []) {
        counts[item.user_id] =
            (counts[item.user_id] || 0) + 1;
    }

    const players = (profiles || [])
        .map(profile => ({
            ...profile,
            completionCount: counts[profile.id] || 0
        }))
        .sort((a, b) =>
            b.completionCount - a.completionCount ||
            String(a.username || "").localeCompare(
                String(b.username || "")
            )
        );

    function render(items) {
        if (count) count.textContent = `${items.length} players`;

        if (!items.length) {
            showEmptyState(
                list,
                "No players found",
                "Try another search or create an account."
            );
            return;
        }

        list.innerHTML = items.map((player, index) => `
            <a class="ranking-item"
               href="profile.html?id=${encodeURIComponent(player.id)}">

                <span class="ranking-position">#${index + 1}</span>

                <span class="ranking-details">
                    <strong>${escapeHTML(player.username || "Player")}</strong>
                    <span>${player.completionCount} verified completions</span>
                </span>
            </a>
        `).join("");
    }

    render(players);

    if (search && search.dataset.hllBound !== "true") {
        search.dataset.hllBound = "true";

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
   8. LEVEL SUBMISSIONS
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

        const name = $("level-name")?.value.trim();
        const levelId = $("level-id")?.value.trim() || "";
        const creator = $("level-creator")?.value.trim() || "";
        const suggestedList = $("suggested-list")?.value;
        const reason = $("submission-reason")?.value.trim() || "";

        if (!name || !suggestedList) {
            showMessage(
                message,
                "Enter the level name and select a list.",
                "error"
            );
            return;
        }

        if (!$("submission-confirm")?.checked) {
            showMessage(
                message,
                "Please confirm that your submission is accurate.",
                "error"
            );
            return;
        }

        setLoading(button, true);

        try {
            const { error } = await supabaseClient
                .from("level_submissions")
                .insert({
                    submitted_by: user.id,
                    name,
                    level_id: levelId,
                    creator,
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
            showMessage(message, getErrorMessage(error), "error");
        } finally {
            setLoading(button, false);
        }
    });
}


/* =========================================================
   9. COMPLETION SUBMISSIONS
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

        const levelId = $("completion-level")?.value;
        const gdUsername = $("gd-username")?.value.trim();
        const evidenceUrl = $("evidence-url")?.value.trim();
        const notes = $("completion-notes")?.value.trim() || "";

        if (!levelId || !gdUsername || !evidenceUrl) {
            showMessage(message, "Complete all required fields.", "error");
            return;
        }

        if (!validHttpUrl(evidenceUrl)) {
            showMessage(
                message,
                "Enter a valid evidence URL.",
                "error"
            );
            return;
        }

        if (!$("completion-confirm")?.checked) {
            showMessage(
                message,
                "Please confirm that your evidence is genuine.",
                "error"
            );
            return;
        }

        setLoading(button, true);

        try {
            const { error } = await supabaseClient
                .from("completion_submissions")
                .insert({
                    submitted_by: user.id,
                    level_id: levelId,
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
                "Evidence submitted! Points only count after staff verification and points configuration.",
                "success"
            );
        } catch (error) {
            showMessage(message, getErrorMessage(error), "error");
        } finally {
            setLoading(button, false);
        }
    });
}


/* =========================================================
   10. PLAYER PROFILE PAGE
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
            id,
            username,
            bio,
            gd_username,
            avatar_url,
            created_at,
            show_bio,
            show_gd_username,
            show_avatar
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
        description.textContent =
            profile.show_bio === false
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
            .order("verified_at", {
                ascending: false
            });

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
            <a class="ranking-item"
               href="level.html?id=${encodeURIComponent(level.id)}">

                <span class="ranking-position">
                    #${escapeHTML(level.rank ?? "—")}
                </span>

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
   11. LEVEL DETAILS
   ========================================================= */

async function renderLevelDetail() {
    const title = $("level-title");

    if (!title) return;

    const id = getQueryParameter("id");

    if (!id) {
        title.textContent = "Level not found";
        return;
    }

    const { data: level, error } = await supabaseClient
        .from("levels")
        .select("*")
        .eq("id", id)
        .eq("status", "approved")
        .maybeSingle();

    if (error || !level) {
        title.textContent = "Level not found";
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
        $("level-points").textContent = "Not configured";
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
            .order("verified_at", {
                ascending: false
            });

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
        (profiles || []).map(profile => [
            profile.id,
            profile.username
        ])
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
   12. ACCOUNT SETTINGS
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

    /* SAVE PROFILE */

    form.addEventListener("submit", async event => {
        event.preventDefault();

        hideMessage(message);

        const button = form.querySelector('[type="submit"]');

        const username = $("settings-username")?.value.trim() || "";
        const bio = $("settings-bio")?.value.trim() || "";
        const gd = $("settings-gd-username")?.value.trim() || "";
        const avatar = $("settings-avatar")?.value.trim() || "";

        if (username.length < 3 || username.length > 24) {
            showMessage(
                message,
                "Your username must be between 3 and 24 characters.",
                "error"
            );
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            showMessage(
                message,
                "Use only letters, numbers, underscores, and hyphens in your username.",
                "error"
            );
            return;
        }

        if (bio.length > 300 || gd.length > 40) {
            showMessage(
                message,
                "Your bio must be 300 characters or less, and your GD username 40 characters or less.",
                "error"
            );
            return;
        }

        if (avatar && !validHttpUrl(avatar)) {
            showMessage(
                message,
                "Enter a valid avatar URL beginning with https:// or http://.",
                "error"
            );
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

            currentProfile = {
                ...currentProfile,
                ...data
            };

            showMessage(
                message,
                "Profile settings saved successfully!",
                "success"
            );
        } catch (error) {
            showMessage(message, getErrorMessage(error), "error");
        } finally {
            setLoading(button, false);
        }
    });

    /* CHANGE EMAIL */

    const emailForm = $("email-settings-form");

    if (emailForm) {
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
                showMessage(
                    msg,
                    "That is already your current email address.",
                    "error"
                );
                return;
            }

            setLoading(button, true);

            try {
                const redirectTo =
                    new URL("login.html", location.href).href;

                const { error } =
                    await supabaseClient.auth.updateUser(
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

    /* CHANGE PASSWORD */

    const passwordForm = $("password-change-form");

    if (passwordForm) {
        passwordForm.addEventListener("submit", async event => {
            event.preventDefault();

            const msg = $("password-change-message");
            const button = passwordForm.querySelector('[type="submit"]');

            const password = $("settings-new-password")?.value || "";
            const confirm = $("settings-confirm-password")?.value || "";

            hideMessage(msg);

            if (password.length < 8) {
                showMessage(
                    msg,
                    "Your password must contain at least 8 characters.",
                    "error"
                );
                return;
            }

            if (password !== confirm) {
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

                showMessage(
                    msg,
                    "Your password has been updated successfully.",
                    "success"
                );
            } catch (error) {
                showMessage(msg, getErrorMessage(error), "error");
            } finally {
                setLoading(button, false);
            }
        });
    }

    /* PASSWORD RECOVERY EMAIL */

    const resetButton = $("password-reset-button");

    if (resetButton) {
        resetButton.addEventListener("click", async () => {
            const msg = $("password-reset-message");

            hideMessage(msg);

            if (!user.email) {
                showMessage(
                    msg,
                    "No email address is associated with this account.",
                    "error"
                );
                return;
            }

            setLoading(resetButton, true);

            try {
                const redirectTo =
                    new URL("login.html", location.href).href;

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

    /* PRIVACY SETTINGS */

    const privacyForm = $("privacy-settings-form");

    if (privacyForm) {
        privacyForm.addEventListener("submit", async event => {
            event.preventDefault();

            const msg = $("privacy-settings-message");
            const button = privacyForm.querySelector('[type="submit"]');

            hideMessage(msg);
            setLoading(button, true);

            try {
                const preferences = {
                    show_bio: $("privacy-show-bio")?.checked ?? true,
                    show_gd_username:
                        $("privacy-show-gd-username")?.checked ?? true,
                    show_avatar: $("privacy-show-avatar")?.checked ?? true
                };

                const { data, error } = await supabaseClient
                    .from("profiles")
                    .update(preferences)
                    .eq("id", user.id)
                    .select()
                    .single();

                if (error) throw error;

                currentProfile = {
                    ...currentProfile,
                    ...data
                };

                showMessage(
                    msg,
                    "Privacy preferences saved successfully!",
                    "success"
                );
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

    /* LOG OUT */

    const logoutButton = $("logout-button");

    if (logoutButton) {
        logoutButton.addEventListener("click", async event => {
            event.preventDefault();

            if (!confirm("Are you sure you want to log out?")) return;

            await logout();
        });
    }

    /* DELETE ACCOUNT */

    const deleteButton = $("delete-account-button");

    if (deleteButton) {
        // Keep disabled until secure server-side deletion is deployed.
        deleteButton.disabled = true;

        deleteButton.title =
            "Account deletion is unavailable until a secure server endpoint is deployed.";

        deleteButton.addEventListener("click", () => {
            showMessage(
                $("delete-account-message"),
                "Account deletion is not enabled yet. A secure server-side Supabase Edge Function must be deployed first. No account data has been deleted.",
                "error"
            );
        });
    }
}


/* =========================================================
   13. STAFF DASHBOARD
   ========================================================= */

async function setupStaffDashboard() {
    const status = $("staff-status");

    if (!status) return;

    const user = await requireLogin();
    if (!user) return;

    const { data: staff, error } = await supabaseClient
        .from("staff_members")
        .select("user_id, role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error || !staff) {
        status.textContent = "Access denied. This account is not staff.";
        status.dataset.type = "error";

        showEmptyState(
            $("staff-level-queue"),
            "Access denied",
            "Only authorized HLL staff can review submissions."
        );

        showEmptyState(
            $("staff-completion-queue"),
            "Access denied",
            "Only authorized HLL staff can review evidence."
        );

        return;
    }

    status.textContent = `Staff access confirmed: ${staff.role}`;

    if ($("pending-level-count")) {
        $("pending-level-count").textContent = "—";
    }

    if ($("pending-completion-count")) {
        $("pending-completion-count").textContent = "—";
    }

    showEmptyState(
        $("staff-level-queue"),
        "Review system not configured",
        "Secure staff approval functions must be installed before this queue can be used."
    );

    showEmptyState(
        $("staff-completion-queue"),
        "Review system not configured",
        "Secure evidence-verification functions must be installed before this queue can be used."
    );
}


/* =========================================================
   14. START HLL
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
                await populateCompletionLevels();
                setupCompletionSubmission();
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
            $("settings-current-email").textContent =
                "Could not load account";
        }

        if ($("settings-message")) {
            showMessage($("settings-message"), getErrorMessage(error), "error");
        } else if ($("auth-message")) {
            showMessage($("auth-message"), message, "error");
        } else if ($("submission-message")) {
            showMessage($("submission-message"), message, "error");
        } else if ($("list-count")) {
            $("list-count").textContent = message;
        } else if ($("ranking-list")) {
            showEmptyState($("ranking-list"), "Connection problem", message);
        }
    }
}

document.addEventListener("DOMContentLoaded", startHLL);



/* =========================================================
   HLL RANKING UPGRADE
   Automatic level points + competitive player leaderboard
   ========================================================= */

/*
    POINTS SYSTEM

    Main List:
    #1   = 150 points
    #150 = 1 point

    Extended List:
    #151 = 50 points
    #350 = 1 point

    Extended List points are distributed across 200 ranks.
*/

function calculateLevelPoints(rank, listType) {
    const position = Number(rank);

    if (!Number.isInteger(position)) {
        return 0;
    }

    if (listType === "main") {
        if (position < 1 || position > 150) {
            return 0;
        }

        return 151 - position;
    }

    if (listType === "extended") {
        if (position < 151 || position > 350) {
            return 0;
        }

        return Math.floor(
            ((350 - position) * 49) / 199
        ) + 1;
    }

    return 0;
}


/* =========================================================
   FANCY LEVEL LIST
   Overrides the previous list renderer
   ========================================================= */

async function renderLevelList(listType) {
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
        "Preparing the official HLL rankings."
    );

    if (count) {
        count.textContent = "Loading rankings...";
    }

    const allLevels = await getApprovedLevels(listType);

    if (allLevels === null) {
        if (count) {
            count.textContent = "Could not load rankings.";
        }

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
                `Approved ${listName} levels will appear here when they are added to HLL.`
            );

            return;
        }

        list.innerHTML = items.map(level => {
            const rank = Number(level.rank);

            const points = calculateLevelPoints(
                rank,
                level.list_type
            );

            let rankClass = "";

            if (rank === 1) rankClass = "rank-first";
            else if (rank === 2) rankClass = "rank-second";
            else if (rank === 3) rankClass = "rank-third";

            return `
                <a
                    class="ranking-item hll-level-card"
                    href="level.html?id=${encodeURIComponent(level.id)}"
                >
                    <span class="ranking-position ${rankClass}">
                        #${rank}
                    </span>

                    <span class="ranking-details">
                        <strong>
                            ${escapeHTML(level.name || "Unnamed level")}
                        </strong>

                        <span class="hll-level-meta">
                            ${escapeHTML(level.creator || "Unknown creator")}
                            ${
                                level.level_id
                                    ? ` · GD ID: ${escapeHTML(level.level_id)}`
                                    : ""
                            }
                        </span>
                    </span>

                    <span class="hll-points-badge">
                        <strong>${points}</strong>
                        <small>POINTS</small>
                    </span>

                    <span class="ranking-arrow" aria-hidden="true">›</span>
                </a>
            `;
        }).join("");
    }

    render(levels);

    if (search && search.dataset.hllFancyBound !== "true") {
        search.dataset.hllFancyBound = "true";

        search.addEventListener("input", () => {
            const term = search.value.trim().toLowerCase();

            const filtered = levels.filter(level =>
                String(level.name || "").toLowerCase().includes(term) ||
                String(level.creator || "").toLowerCase().includes(term) ||
                String(level.rank ?? "").includes(term) ||
                String(level.level_id || "").toLowerCase().includes(term)
            );

            render(filtered);
        });
    }
}


/* =========================================================
   PLAYER LEADERBOARD
   Points come from verified completions
   ========================================================= */

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
            .select("id, username, gd_username")
            .order("username", { ascending: true }),

        supabaseClient
            .from("levels")
            .select("id, rank, list_type, status")
            .eq("status", "approved"),

        supabaseClient
            .from("completions")
            .select("user_id, level_id")
    ]);

    if (profilesResult.error) {
        showEmptyState(
            list,
            "Could not load players",
            profilesResult.error.message
        );

        return;
    }

    if (levelsResult.error) {
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

    for (const level of levelsResult.data || []) {
        const points = calculateLevelPoints(
            level.rank,
            level.list_type
        );

        if (points > 0) {
            levelPoints.set(level.id, points);
        }
    }

    const playerTotals = new Map();

    for (const profile of profilesResult.data || []) {
        playerTotals.set(profile.id, {
            ...profile,
            points: 0,
            completions: 0
        });
    }

    /*
       A verified completion only counts when it references
       an approved, ranked level.

       Duplicate completion records for the same player and
       level count only once.
    */

    const countedCompletions = new Set();

    for (const completion of completionsResult.data || []) {
        const player = playerTotals.get(completion.user_id);
        const points = levelPoints.get(completion.level_id);

        if (!player || !points) continue;

        const uniqueKey =
            `${completion.user_id}:${completion.level_id}`;

        if (countedCompletions.has(uniqueKey)) continue;

        countedCompletions.add(uniqueKey);

        player.points += points;
        player.completions += 1;
    }

    const players = [...playerTotals.values()].sort((a, b) =>
        b.points - a.points ||
        b.completions - a.completions ||
        String(a.username || "").localeCompare(
            String(b.username || "")
        )
    );

    function render(items) {
        if (count) {
            count.textContent = `${items.length} players`;
        }

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
                    href="profile.html?id=${encodeURIComponent(player.id)}"
                >
                    <span class="ranking-position ${rankClass}">
                        #${position}
                    </span>

                    <span class="ranking-details">
                        <strong>
                            ${escapeHTML(player.username || "Player")}
                        </strong>

                        <span>
                            ${player.completions} verified level${player.completions === 1 ? "" : "s"}
                        </span>
                    </span>

                    <span class="hll-points-badge">
                        <strong>${player.points.toLocaleString()}</strong>
                        <small>POINTS</small>
                    </span>

                    <span class="ranking-arrow" aria-hidden="true">›</span>
                </a>
            `;
        }).join("");
    }

    render(players);

    if (search && search.dataset.hllPointsSearchBound !== "true") {
        search.dataset.hllPointsSearchBound = "true";

        search.addEventListener("input", () => {
            const term = search.value.trim().toLowerCase();

            render(players.filter(player =>
                String(player.username || "").toLowerCase().includes(term) ||
                String(player.gd_username || "").toLowerCase().includes(term)
            ));
        });
    }
}
