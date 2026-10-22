
/* ============================================
   HLL — HARDEST LEVELS LIST
   Main JavaScript
   ============================================ */

"use strict";

/* ============================================
   1. SUPABASE CONFIGURATION
   ============================================ */

const SUPABASE_URL = "https://ldtnptrhnpulvjwdtzwa.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_WXmIU22zRyh_MYtS1jFOJw_b8N9VVYo";

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;

/* ============================================
   2. GENERAL HELPERS
   ============================================ */

const $ = id => document.getElementById(id);

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

function pageName() {
    return window.location.pathname.split("/").pop() || "index.html";
}

function getQueryParameter(name) {
    return new URLSearchParams(window.location.search).get(name);
}

function setLoading(button, loading, originalText = "Submit") {
    if (!button) return;

    if (loading) {
        button.dataset.originalText = button.textContent;
        button.disabled = true;
        button.textContent = "Please wait...";
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || originalText;
    }
}

function formatDate(value) {
    if (!value) return "Unknown date";

    return new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function getErrorMessage(error) {
    return error?.message || "Something went wrong. Please try again.";
}

function showEmptyState(element, title, description) {
    if (!element) return;

    element.innerHTML = `
        <div class="empty-state">
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(description)}</p>
        </div>
    `;
}

/* ============================================
   3. LOAD SUPABASE AUTOMATICALLY
   ============================================ */

function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
        if (window.supabase?.createClient) {
            resolve();
            return;
        }

        const existingScript = document.querySelector(
            'script[data-hll-supabase="true"]'
        );

        if (existingScript) {
            existingScript.addEventListener("load", resolve, { once: true });
            existingScript.addEventListener(
                "error",
                () => reject(new Error("Could not load Supabase.")),
                { once: true }
            );
            return;
        }

        const script = document.createElement("script");

        script.src =
            "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.dataset.hllSupabase = "true";

        script.onload = resolve;

        script.onerror = () => {
            reject(new Error(
                "Supabase could not load. Check your internet connection."
            ));
        };

        document.head.appendChild(script);
    });
}

async function initializeSupabase() {
    await loadSupabaseLibrary();

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        throw new Error("Supabase configuration is incomplete.");
    }

    supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

    return supabaseClient;
}

/* ============================================
   4. AUTHENTICATION HELPERS
   ============================================ */

async function loadCurrentUser() {
    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient.auth.getUser();

    if (error) {
        currentUser = null;
        return null;
    }

    currentUser = data.user || null;

    if (currentUser) {
        await ensureProfile();
    }

    return currentUser;
}

async function ensureProfile() {
    if (!currentUser) return null;

    const { data: existingProfile, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {
        console.error("Profile lookup failed:", error.message);
        return null;
    }

    if (existingProfile) {
        currentProfile = existingProfile;
        return existingProfile;
    }

    const metadata = currentUser.user_metadata || {};

    const baseUsername =
        metadata.username ||
        currentUser.email?.split("@")[0] ||
        "player";

    const username = String(baseUsername)
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 24) || "player";

    const { data: newProfile, error: insertError } =
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

    if (insertError) {
        console.warn(
            "Could not create profile automatically:",
            insertError.message
        );
        return null;
    }

    currentProfile = newProfile;
    return newProfile;
}

async function requireLogin() {
    const user = await loadCurrentUser();

    if (!user) {
        const destination = encodeURIComponent(
            window.location.pathname + window.location.search
        );

        window.location.href = `login.html?next=${destination}`;
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

    window.location.href = "index.html";
}

/* ============================================
   5. AUTHENTICATION PAGE
   login.html
   ============================================ */

function setupAuthTabs() {
    const loginTab = $("login-tab");
    const signupTab = $("signup-tab");
    const title = $("auth-title");
    const description = $("auth-description");
    const username = $("username");
    const usernameHint = $("username-hint");
    const passwordHint = $("password-hint");
    const submit = $("auth-submit");

    let mode = getQueryParameter("mode") === "signup"
        ? "signup"
        : "login";

    function setMode(nextMode) {
        mode = nextMode;

        const signingUp = mode === "signup";

        if (title) {
            title.textContent = signingUp ? "Create account" : "Welcome back";
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

        if (passwordHint) {
            passwordHint.hidden = !signingUp;
        }

        if (submit) {
            submit.textContent = signingUp ? "Create account" : "Log in";
        }
    }

    loginTab?.addEventListener("click", () => setMode("login"));
    signupTab?.addEventListener("click", () => setMode("signup"));

    const form = $("auth-form");

    form?.addEventListener("submit", async event => {
        event.preventDefault();

        const message = $("auth-message");
        const submitButton = $("auth-submit");

        hideMessage(message);

        const email = $("email")?.value.trim();
        const password = $("password")?.value;
        const enteredUsername = $("username")?.value.trim();

        if (!email || !password) {
            showMessage(message, "Enter your email and password.", "error");
            return;
        }

        if (mode === "signup") {
            if (!enteredUsername ||
                enteredUsername.length < 3 ||
                enteredUsername.length > 24) {
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

        setLoading(submitButton, true);

        try {
            if (mode === "signup") {
                const { data, error } = await supabaseClient.auth.signUp({
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

                    const { error: profileError } = await supabaseClient
                        .from("profiles")
                        .insert({
                            id: data.user.id,
                            username: enteredUsername,
                            bio: "",
                            gd_username: ""
                        });

                    if (profileError) {
                        console.error(
                            "Profile creation failed:",
                            profileError.message
                        );

                        showMessage(
                            message,
                            "Your account was created, but your profile could not be created. Please log in and try again.",
                            "error"
                        );
                        return;
                    }

                    const next = getQueryParameter("next");

                    window.location.href =
                        next && next.startsWith("/") && !next.startsWith("//")
                            ? next
                            : "index.html";

                    return;
                }

                showMessage(
                    message,
                    "Account created! Check your email to confirm your account, then log in. Your profile will be created after confirmation.",
                    "success"
                );

                setMode("login");
            } else {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) throw error;

                currentUser = data.user;

                await ensureProfile();

                const next = getQueryParameter("next");

                window.location.href =
                    next && next.startsWith("/") && !next.startsWith("//")
                        ? next
                        : "index.html";
            }
        } catch (error) {
            showMessage(message, getErrorMessage(error), "error");
        } finally {
            setLoading(submitButton, false);
        }
    });

    setMode(mode);
}

/* ============================================
   6. APPROVED LEVELS
   main-list.html
   extended-list.html
   ============================================ */

async function getApprovedLevels(listType = null) {
    const list = $("ranking-list");

    let query = supabaseClient
        .from("levels")
        .select("id, name, level_id, creator, list_type, rank, description")
        .eq("status", "approved")
        .order("rank", { ascending: true });

    if (listType) {
        query = query.eq("list_type", listType);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Level loading failed:", error.message);

        if (list) {
            showEmptyState(
                list,
                "Could not load levels",
                "Please refresh the page and try again."
            );
        }

        return [];
    }

    return data || [];
}

async function renderLevelList(listType) {
    const list = $("ranking-list");
    const count = $("list-count");
    const search = $("level-search");

    if (!list) return;

    list.textContent = "Loading levels...";

    const levels = await getApprovedLevels(listType);

    function render(filteredLevels) {
        if (count) {
            count.textContent = `${filteredLevels.length} levels`;
        }

        if (!filteredLevels.length) {
            showEmptyState(
                list,
                "No levels found",
                "Approved levels will appear here when they are added."
            );
            return;
        }

        list.innerHTML = filteredLevels.map(level => `
            <a class="ranking-item"
               href="level.html?id=${encodeURIComponent(level.id)}">
                <span class="ranking-position">#${level.rank}</span>
                <span class="ranking-details">
                    <strong>${escapeHTML(level.name)}</strong>
                    <span>${escapeHTML(level.creator || "Unknown creator")}</span>
                </span>
                <span class="ranking-arrow" aria-hidden="true">›</span>
            </a>
        `).join("");
    }

    render(levels);

    if (search && !search.dataset.hllBound) {
        search.dataset.hllBound = "true";

        search.addEventListener("input", () => {
            const term = search.value.trim().toLowerCase();

            render(levels.filter(level =>
                level.name.toLowerCase().includes(term) ||
                (level.creator || "").toLowerCase().includes(term) ||
                String(level.rank).includes(term) ||
                String(level.level_id || "").includes(term)
            ));
        });
    }
}

/* ============================================
   7. PLAYERS LIST
   players.html
   ============================================ */

async function renderPlayersList() {
    const list = $("player-list");
    const count = $("player-count");
    const search = $("player-search");

    if (!list) return;

    list.textContent = "Loading players...";

    const { data: profiles, error: profilesError } = await supabaseClient
        .from("profiles")
        .select("id, username, gd_username, bio")
        .order("username", { ascending: true });

    if (profilesError) {
        showEmptyState(
            list,
            "Could not load players",
            "Please refresh the page and try again."
        );
        return;
    }

    const { data: completions, error: completionsError } =
        await supabaseClient
            .from("completions")
            .select("user_id");

    if (completionsError) {
        console.error(completionsError.message);

        showEmptyState(
            list,
            "Could not load player statistics",
            "Please try again later."
        );
        return;
    }

    const completionCounts = {};

    for (const completion of completions || []) {
        completionCounts[completion.user_id] =
            (completionCounts[completion.user_id] || 0) + 1;
    }

    const players = (profiles || []).map(profile => ({
        ...profile,
        completionCount: completionCounts[profile.id] || 0
    })).sort((a, b) =>
        b.completionCount - a.completionCount ||
        a.username.localeCompare(b.username)
    );

    function render(filteredPlayers) {
        if (count) {
            count.textContent = `${filteredPlayers.length} players`;
        }

        if (!filteredPlayers.length) {
            showEmptyState(
                list,
                "No players found",
                "Try a different search or create an account."
            );
            return;
        }

        list.innerHTML = filteredPlayers.map((player, index) => `
            <a class="ranking-item"
               href="profile.html?id=${encodeURIComponent(player.id)}">
                <span class="ranking-position">#${index + 1}</span>
                <span class="ranking-details">
                    <strong>${escapeHTML(player.username)}</strong>
                    <span>${player.completionCount} verified completions</span>
                </span>
            </a>
        `).join("");
    }

    render(players);

    if (search && !search.dataset.hllBound) {
        search.dataset.hllBound = "true";

        search.addEventListener("input", () => {
            const term = search.value.trim().toLowerCase();

            render(players.filter(player =>
                player.username.toLowerCase().includes(term) ||
                (player.gd_username || "").toLowerCase().includes(term)
            ));
        });
    }
}

/* ============================================
   8. SUBMIT A LEVEL
   submit.html
   ============================================ */

function setupLevelSubmission() {
    const form = $("level-submit-form");

    if (!form) return;

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
        const confirmed = $("submission-confirm")?.checked;

        if (!name || !suggestedList) {
            showMessage(message, "Enter the level name and select a list.", "error");
            return;
        }

        if (!confirmed) {
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

/* ============================================
   9. SUBMIT COMPLETION EVIDENCE
   completion.html
   ============================================ */

async function populateCompletionLevels() {
    const select = $("completion-level");

    if (!select) return;

    const levels = await getApprovedLevels();

    select.innerHTML = `
        <option value="">Choose a ranked level</option>
        ${levels.map(level => `
            <option value="${escapeHTML(level.id)}">
                #${level.rank} — ${escapeHTML(level.name)}
            </option>
        `).join("")}
    `;

    const requestedLevel = getQueryParameter("level");

    if (requestedLevel) {
        select.value = requestedLevel;
    }
}

function setupCompletionSubmission() {
    const form = $("completion-form");

    if (!form) return;

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
        const confirmed = $("completion-confirm")?.checked;

        if (!levelId || !gdUsername || !evidenceUrl) {
            showMessage(
                message,
                "Complete all required fields.",
                "error"
            );
            return;
        }

        try {
            const parsedUrl = new URL(evidenceUrl);

            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                throw new Error("Evidence must use a valid HTTP or HTTPS link.");
            }
        } catch {
            showMessage(
                message,
                "Enter a valid evidence URL.",
                "error"
            );
            return;
        }

        if (!confirmed) {
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
                "Completion evidence submitted! Your points will only count after staff verification and the points system is configured.",
                "success"
            );
        } catch (error) {
            showMessage(message, getErrorMessage(error), "error");
        } finally {
            setLoading(button, false);
        }
    });
}

/* ============================================
   10. PROFILE PAGE
   profile.html
   ============================================ */

async function renderProfile() {
    const heading = $("profile-heading");
    const description = $("profile-description");
    const actions = $("profile-actions");
    const rank = $("profile-rank");
    const points = $("profile-points");
    const completionsCount = $("profile-completions");
    const completionList = $("profile-completion-list");

    if (!heading) return;

    const profileId = getQueryParameter("id") ||
        (await loadCurrentUser())?.id;

    if (!profileId) {
        heading.textContent = "Player not found";

        if (description) {
            description.textContent = "Log in or select a player profile.";
        }

        return;
    }

    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("id, username, bio, gd_username, avatar_url, created_at")
        .eq("id", profileId)
        .maybeSingle();

    if (error || !profile) {
        heading.textContent = "Player not found";
        if (description) description.textContent = "This profile may not exist.";
        return;
    }

    heading.textContent = profile.username;

    if (description) {
        description.textContent = profile.bio || "No biography yet.";
    }

    const ownProfile = currentUser?.id === profile.id;

    if (actions) {
        actions.innerHTML = ownProfile
            ? '<a class="button" href="settings.html">Edit profile</a>'
            : "";
    }

    if (rank) rank.textContent = "—";

    if (points) {
        points.textContent = "Not configured";
    }

    const { data: completions, error: completionError } =
        await supabaseClient
            .from("completions")
            .select("id, level_id, verified_at")
            .eq("user_id", profile.id)
            .order("verified_at", { ascending: false });

    if (completionError) {
        if (completionList) {
            showEmptyState(
                completionList,
                "Could not load completions",
                "Please try again later."
            );
        }

        return;
    }

    const verifiedCompletions = completions || [];

    if (completionsCount) {
        completionsCount.textContent = String(verifiedCompletions.length);
    }

    if (!completionList) return;

    if (!verifiedCompletions.length) {
        showEmptyState(
            completionList,
            "No verified completions",
            "Verified level completions will appear here."
        );
        return;
    }

    const levelIds = verifiedCompletions.map(item => item.level_id);

    const { data: levels } = await supabaseClient
        .from("levels")
        .select("id, name, rank, list_type")
        .in("id", levelIds);

    const levelsById = Object.fromEntries(
        (levels || []).map(level => [level.id, level])
    );

    completionList.innerHTML = verifiedCompletions.map(completion => {
        const level = levelsById[completion.level_id];

        if (!level) return "";

        return `
            <a class="ranking-item"
               href="level.html?id=${encodeURIComponent(level.id)}">
                <span class="ranking-position">#${level.rank}</span>
                <span class="ranking-details">
                    <strong>${escapeHTML(level.name)}</strong>
                    <span>Verified ${formatDate(completion.verified_at)}</span>
                </span>
            </a>
        `;
    }).join("");
}

/* ============================================
   11. LEVEL DETAIL PAGE
   level.html
   ============================================ */

async function renderLevelDetail() {
    const title = $("level-title");

    if (!title) return;

    const levelId = getQueryParameter("id");

    if (!levelId) {
        title.textContent = "Level not found";
        return;
    }

    const { data: level, error } = await supabaseClient
        .from("levels")
        .select("*")
        .eq("id", levelId)
        .eq("status", "approved")
        .maybeSingle();

    if (error || !level) {
        title.textContent = "Level not found";
        return;
    }

    title.textContent = level.name;

    if ($("level-list-type")) {
        $("level-list-type").textContent =
            level.list_type === "main" ? "Main List" : "Extended List";
    }

    if ($("level-description")) {
        $("level-description").textContent =
            level.description || "No description provided.";
    }

    if ($("level-rank")) {
        $("level-rank").textContent = `#${level.rank}`;
    }

    if ($("level-points")) {
        $("level-points").textContent = "Not configured";
    }

    if ($("level-detail-name")) {
        $("level-detail-name").textContent = level.name;
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

    const completionList = $("level-completions");

    const { data: completions, error: completionError } =
        await supabaseClient
            .from("completions")
            .select("id, user_id, verified_at")
            .eq("level_id", level.id)
            .order("verified_at", { ascending: false });

    if (completionError) {
        if (completionList) {
            showEmptyState(
                completionList,
                "Could not load completions",
                "Please try again later."
            );
        }

        return;
    }

    const verifiedCompletions = completions || [];

    if ($("level-completion-count")) {
        $("level-completion-count").textContent =
            String(verifiedCompletions.length);
    }

    if (!completionList) return;

    if (!verifiedCompletions.length) {
        showEmptyState(
            completionList,
            "No verified completions yet",
            "Verified completions will appear here."
        );
        return;
    }

    const userIds = [...new Set(
        verifiedCompletions.map(item => item.user_id)
    )];

    const { data: profiles } = await supabaseClient
        .from("profiles")
        .select("id, username")
        .in("id", userIds);

    const usernames = Object.fromEntries(
        (profiles || []).map(profile => [profile.id, profile.username])
    );

    completionList.innerHTML = verifiedCompletions.map(completion => `
        <a class="ranking-item"
           href="profile.html?id=${encodeURIComponent(completion.user_id)}">
            <span class="ranking-details">
                <strong>${escapeHTML(
                    usernames[completion.user_id] || "Player"
                )}</strong>
                <span>Verified ${formatDate(completion.verified_at)}</span>
            </span>
        </a>
    `).join("");
}

/* ============================================
   12. PROFILE SETTINGS
   settings.html
   ============================================ */

async function setupSettings() {
    const form = $("profile-settings-form");

    if (!form) return;

    const message = $("settings-message");

    const user = await requireLogin();
    if (!user) return;

    let profile = currentProfile;

    if (!profile) {
        const { data } = await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

        profile = data;
    }

    if (!profile) {
        showMessage(
            message,
            "Your profile could not be loaded. Try logging out and back in.",
            "error"
        );
        return;
    }

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

    form.addEventListener("submit", async event => {
        event.preventDefault();

        hideMessage(message);

        const button = form.querySelector('[type="submit"]');

        const username = $("settings-username")?.value.trim();
        const bio = $("settings-bio")?.value.trim() || "";
        const gdUsername = $("settings-gd-username")?.value.trim() || "";
        const avatarUrl = $("settings-avatar")?.value.trim() || "";

        if (!username || username.length < 3 || username.length > 24) {
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

        if (bio.length > 300 || gdUsername.length > 40) {
            showMessage(
                message,
                "Your bio or Geometry Dash username is too long.",
                "error"
            );
            return;
        }

        if (avatarUrl) {
            try {
                const url = new URL(avatarUrl);

                if (!["http:", "https:"].includes(url.protocol)) {
                    throw new Error();
                }
            } catch {
                showMessage(message, "Enter a valid avatar URL.", "error");
                return;
            }
        }

        setLoading(button, true);

        try {
            const { data, error } = await supabaseClient
                .from("profiles")
                .update({
                    username,
                    bio,
                    gd_username: gdUsername,
                    avatar_url: avatarUrl || null
                })
                .eq("id", user.id)
                .select()
                .single();

            if (error) throw error;

            currentProfile = data;

            showMessage(message, "Profile settings saved.", "success");
        } catch (error) {
            showMessage(message, getErrorMessage(error), "error");
        } finally {
            setLoading(button, false);
        }
    });

    $("password-reset-button")?.addEventListener("click", async () => {
        const resetMessage = $("password-reset-message");

        hideMessage(resetMessage);

        if (!user.email) {
            showMessage(
                resetMessage,
                "No email address is associated with this account.",
                "error"
            );
            return;
        }

        const { error } = await supabaseClient.auth.resetPasswordForEmail(
            user.email,
            {
                redirectTo: window.location.origin + "/login.html"
            }
        );

        if (error) {
            showMessage(resetMessage, getErrorMessage(error), "error");
            return;
        }

        showMessage(
            resetMessage,
            "If password recovery is enabled, check your email for the reset link.",
            "success"
        );
    });
}

/* ============================================
   13. STAFF DASHBOARD
   staff.html
   ============================================ */

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

        if ($("staff-level-queue")) {
            showEmptyState(
                $("staff-level-queue"),
                "Access denied",
                "Only authorized HLL staff can review submissions."
            );
        }

        if ($("staff-completion-queue")) {
            showEmptyState(
                $("staff-completion-queue"),
                "Access denied",
                "Only authorized HLL staff can review evidence."
            );
        }

        return;
    }

    status.textContent = `Staff access confirmed: ${staff.role}`;

    /*
       IMPORTANT:
       Staff review queues are intentionally not loaded here yet.

       The current database policies do not authorize staff review
       operations. We must create secure database-side review functions
       before adding approve/reject buttons to this dashboard.
    */

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

/* ============================================
   14. GLOBAL PAGE STARTUP
   ============================================ */

async function startHLL() {
    try {
        await initializeSupabase();
        await loadCurrentUser();

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

        $("logout-button")?.addEventListener("click", logout);

        console.log("HLL initialized successfully:", page);
    } catch (error) {
        console.error("HLL initialization failed:", error);

        const message =
            "HLL could not connect to Supabase. Check your internet connection and try refreshing.";

        const authMessage = $("auth-message");
        const submissionMessage = $("submission-message");

        if (authMessage) {
            showMessage(authMessage, message, "error");
        } else if (submissionMessage) {
            showMessage(submissionMessage, message, "error");
        }
    }
}

document.addEventListener("DOMContentLoaded", startHLL);


/* ============================================
   12. PROFILE SETTINGS
   settings.html
   ============================================ */

async function setupSettings() {
    const form = $("profile-settings-form");
    if (!form) return;

    const message = $("settings-message");
    const user = await requireLogin();
    if (!user) return;

    const currentEmail = $("settings-current-email");

    if (currentEmail) {
        currentEmail.textContent = user.email || "No email available";
    }

    // Load the player's profile.
    let profile = currentProfile;

    if (!profile || profile.id !== user.id) {
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

        if (error) {
            showMessage(message, getErrorMessage(error), "error");
            return;
        }

        profile = data;
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

    // Populate profile fields.
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

    // Populate privacy preferences.
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

    // Prevent duplicate event handlers if setup is called again.
    if (form.dataset.hllSettingsBound === "true") return;
    form.dataset.hllSettingsBound = "true";

    /* --------------------------------------------
       SAVE PROFILE
       -------------------------------------------- */

    form.addEventListener("submit", async event => {
        event.preventDefault();
        hideMessage(message);

        const button = form.querySelector('[type="submit"]');

        const username = $("settings-username")?.value.trim() || "";
        const bio = $("settings-bio")?.value.trim() || "";
        const gdUsername =
            $("settings-gd-username")?.value.trim() || "";
        const avatarUrl = $("settings-avatar")?.value.trim() || "";

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

        if (bio.length > 300 || gdUsername.length > 40) {
            showMessage(
                message,
                "Your bio must be 300 characters or less, and your GD username must be 40 characters or less.",
                "error"
            );
            return;
        }

        if (avatarUrl) {
            try {
                const url = new URL(avatarUrl);

                if (!["http:", "https:"].includes(url.protocol)) {
                    throw new Error("Invalid protocol");
                }
            } catch {
                showMessage(
                    message,
                    "Enter a valid avatar URL beginning with https:// or http://.",
                    "error"
                );
                return;
            }
        }

        setLoading(button, true);

        try {
            const { data, error } = await supabaseClient
                .from("profiles")
                .update({
                    username,
                    bio,
                    gd_username: gdUsername,
                    avatar_url: avatarUrl || null
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

    /* --------------------------------------------
       CHANGE EMAIL
       Requires Supabase email confirmation settings.
       -------------------------------------------- */

    $("email-settings-form")?.addEventListener(
        "submit",
        async event => {
            event.preventDefault();

            const emailForm = event.currentTarget;
            const emailMessage = $("email-settings-message");
            const button = emailForm.querySelector('[type="submit"]');
            const newEmail = $("settings-new-email")?.value.trim() || "";

            hideMessage(emailMessage);

            if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
                showMessage(
                    emailMessage,
                    "Enter a valid email address.",
                    "error"
                );
                return;
            }

            if (newEmail.toLowerCase() === (user.email || "").toLowerCase()) {
                showMessage(
                    emailMessage,
                    "That is already your current email address.",
                    "error"
                );
                return;
            }

            setLoading(button, true);

            try {
                const redirectUrl = new URL(
                    "login.html",
                    window.location.href
                ).href;

                const { error } = await supabaseClient.auth.updateUser(
                    { email: newEmail },
                    { emailRedirectTo: redirectUrl }
                );

                if (error) throw error;

                emailForm.reset();

                showMessage(
                    emailMessage,
                    "Email change requested. Follow the verification instructions sent by Supabase. Your displayed email will update after the change is confirmed.",
                    "success"
                );
            } catch (error) {
                showMessage(
                    emailMessage,
                    getErrorMessage(error),
                    "error"
                );
            } finally {
                setLoading(button, false);
            }
        }
    );

    /* --------------------------------------------
       CHANGE PASSWORD
       -------------------------------------------- */

    $("password-change-form")?.addEventListener(
        "submit",
        async event => {
            event.preventDefault();

            const passwordForm = event.currentTarget;
            const passwordMessage = $("password-change-message");
            const button = passwordForm.querySelector('[type="submit"]');

            const newPassword =
                $("settings-new-password")?.value || "";
            const confirmPassword =
                $("settings-confirm-password")?.value || "";

            hideMessage(passwordMessage);

            if (newPassword.length < 8) {
                showMessage(
                    passwordMessage,
                    "Your password must contain at least 8 characters.",
                    "error"
                );
                return;
            }

            if (newPassword !== confirmPassword) {
                showMessage(
                    passwordMessage,
                    "The passwords do not match.",
                    "error"
                );
                return;
            }

            setLoading(button, true);

            try {
                const { error } = await supabaseClient.auth.updateUser({
                    password: newPassword
                });

                if (error) throw error;

                passwordForm.reset();

                showMessage(
                    passwordMessage,
                    "Your password has been updated successfully.",
                    "success"
                );
            } catch (error) {
                showMessage(
                    passwordMessage,
                    getErrorMessage(error),
                    "error"
                );
            } finally {
                setLoading(button, false);
            }
        }
    );

    /* --------------------------------------------
       PASSWORD RECOVERY EMAIL
       -------------------------------------------- */

    $("password-reset-button")?.addEventListener(
        "click",
        async () => {
            const resetMessage = $("password-reset-message");
            const button = $("password-reset-button");

            hideMessage(resetMessage);

            if (!user.email) {
                showMessage(
                    resetMessage,
                    "No email address is associated with this account.",
                    "error"
                );
                return;
            }

            setLoading(button, true);

            try {
                const redirectUrl = new URL(
                    "login.html",
                    window.location.href
                ).href;

                const { error } =
                    await supabaseClient.auth.resetPasswordForEmail(
                        user.email,
                        { redirectTo: redirectUrl }
                    );

                if (error) throw error;

                showMessage(
                    resetMessage,
                    "If password recovery is enabled, check your email for the reset link.",
                    "success"
                );
            } catch (error) {
                showMessage(
                    resetMessage,
                    getErrorMessage(error),
                    "error"
                );
            } finally {
                setLoading(button, false);
            }
        }
    );

    /* --------------------------------------------
       PRIVACY PREFERENCES
       Requires these columns in profiles:
       show_bio, show_gd_username, show_avatar
       -------------------------------------------- */

    $("privacy-settings-form")?.addEventListener(
        "submit",
        async event => {
            event.preventDefault();

            const privacyForm = event.currentTarget;
            const privacyMessage = $("privacy-settings-message");
            const button = privacyForm.querySelector('[type="submit"]');

            hideMessage(privacyMessage);
            setLoading(button, true);

            const preferences = {
                show_bio: $("privacy-show-bio")?.checked ?? true,
                show_gd_username:
                    $("privacy-show-gd-username")?.checked ?? true,
                show_avatar: $("privacy-show-avatar")?.checked ?? true
            };

            try {
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
                    privacyMessage,
                    "Privacy preferences saved. Public profile pages must also enforce these settings before the fields will be hidden from visitors.",
                    "success"
                );
            } catch (error) {
                showMessage(
                    privacyMessage,
                    "Could not save privacy settings: " +
                        getErrorMessage(error),
                    "error"
                );
            } finally {
                setLoading(button, false);
            }
        }
    );

    /* --------------------------------------------
       ACCOUNT DELETION
       Intentionally disabled until a secure server
       endpoint has been deployed and tested.
       -------------------------------------------- */

    const deleteButton = $("delete-account-button");

    if (deleteButton) {
        deleteButton.disabled = true;
        deleteButton.title =
            "Account deletion is unavailable until the secure server endpoint is deployed.";
    }

    $("delete-account-button")?.addEventListener("click", () => {
        showMessage(
            $("delete-account-message"),
            "Account deletion is not enabled yet. A secure server-side Supabase Edge Function must be deployed first. No account data has been deleted.",
            "error"
        );
    });
}

