
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const loginButton = document.querySelector(".login-button");

    if (!loginButton) return;

    // Wait until HLL's existing Supabase client is initialized.
    let attempts = 0;

    while (
        typeof supabaseClient === "undefined" ||
        !supabaseClient
    ) {
        if (attempts++ >= 100) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    async function updateNavigation(user) {
        const headerButton = document.querySelector(".login-button");

        if (!headerButton) return;

        const existingAccountNav = document.querySelector(".account-nav");

        if (existingAccountNav) {
            existingAccountNav.remove();
        }

        if (!user) {
            headerButton.textContent = "Log In";
            headerButton.href = "login.html";
            headerButton.hidden = false;
            return;
        }

        let username =
            user.user_metadata?.username ||
            user.email?.split("@")[0] ||
            "My Profile";

        const { data: profile } = await supabaseClient
            .from("profiles")
            .select("username")
            .eq("id", user.id)
            .maybeSingle();

        if (profile?.username) {
            username = profile.username;
        }

        const accountNav = document.createElement("div");
        accountNav.className = "account-nav";

        const profileLink = document.createElement("a");
        profileLink.className = "login-button";
        profileLink.href = `profile.html?id=${encodeURIComponent(user.id)}`;
        profileLink.textContent = username;

        const logoutButton = document.createElement("button");
        logoutButton.className = "login-button account-logout";
        logoutButton.type = "button";
        logoutButton.textContent = "Log Out";

        logoutButton.addEventListener("click", async () => {
            logoutButton.disabled = true;
            logoutButton.textContent = "Logging out...";

            const { error } = await supabaseClient.auth.signOut();

            if (error) {
                alert("Could not log out: " + error.message);
                logoutButton.disabled = false;
                logoutButton.textContent = "Log Out";
                return;
            }

            window.location.href = "index.html";
        });

        accountNav.append(profileLink, logoutButton);
        headerButton.replaceWith(accountNav);
    }

    const { data, error } = await supabaseClient.auth.getUser();

    if (!error) {
        await updateNavigation(data.user || null);
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        updateNavigation(session?.user || null);
    });
});
