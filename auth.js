// CivicFix Auth and Navigation Guard Module
// Handles user logins, registrations, route guarding, and navigation headers.

// 1. Unified Registration Handler
async function registerCitizen(name, email, password) {
  if (!db || !auth) {
    showToast("Firebase is not configured! Please click the gear icon.", "error");
    return;
  }
  
  try {
    // Create Auth User
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Update Display Name
    await user.updateProfile({ displayName: name });
    
    // Save User Document in Firestore
    await db.collection("users").doc(user.uid).set({
      uid: user.uid,
      name: name,
      email: email,
      role: "citizen",
      department: "" // Empty for citizens
    });
    
    showToast("Registration successful! Welcome to CivicFix.", "success");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 1500);
  } catch (error) {
    console.error("Signup failed:", error);
    showToast(error.message, "error");
  }
}

// 2. Unified Login Handler
async function loginUser(email, password) {
  if (!db || !auth) {
    showToast("Firebase is not configured! Please click the gear icon.", "error");
    return;
  }
  
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Fetch User Role from Firestore
    const docSnapshot = await db.collection("users").doc(user.uid).get();
    
    if (docSnapshot.exists) {
      const userData = docSnapshot.data();
      showToast(`Welcome back, ${userData.name}!`, "success");
      
      // Route based on role
      setTimeout(() => {
        if (userData.role === "admin") {
          window.location.href = "admin-dashboard.html";
        } else if (userData.role === "officer") {
          window.location.href = "officer-dashboard.html";
        } else {
          window.location.href = "track.html";
        }
      }, 1200);
    } else {
      // User created in auth but doc doesn't exist (edge case)
      // Create user doc as citizen
      await db.collection("users").doc(user.uid).set({
        uid: user.uid,
        name: user.displayName || email.split("@")[0],
        email: email,
        role: "citizen",
        department: ""
      });
      window.location.href = "track.html";
    }
  } catch (error) {
    console.error("Login failed:", error);
    showToast(error.message, "error");
  }
}

// 3. User Signout Helper
async function logoutUser() {
  if (!auth) return;
  try {
    await auth.signOut();
    showToast("Logged out successfully.", "info");
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1000);
  } catch (error) {
    showToast("Logout failed: " + error.message, "error");
  }
}

// 4. Session Checker and Route Guard
// Checks authentication status. If mismatch, handles redirects.
function guardRoute(allowedRoles = []) {
  if (!auth) {
    // If not configured, just let page load (so settings modal can be configured)
    return;
  }
  
  auth.onAuthStateChanged(async (user) => {
    const currentPage = window.location.pathname.split("/").pop();
    
    if (!user) {
      // Protected pages require login
      const isPublicPage = ["index.html", "login.html", "signup.html", "map.html", ""].includes(currentPage);
      if (!isPublicPage) {
        window.location.href = "login.html";
      } else {
        renderNavigation(null);
      }
    } else {
      // User is logged in, fetch their Firestore user doc
      try {
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          
          // Check role restrictions
          if (allowedRoles.length > 0 && !allowedRoles.includes(userData.role)) {
            showToast("Access Denied: Insufficient Permissions.", "error");
            setTimeout(() => {
              if (userData.role === "admin") window.location.href = "admin-dashboard.html";
              else if (userData.role === "officer") window.location.href = "officer-dashboard.html";
              else window.location.href = "track.html";
            }, 1500);
            return;
          }
          
          // Redirect from login/signup if already logged in
          if (["login.html", "signup.html"].includes(currentPage)) {
            if (userData.role === "admin") window.location.href = "admin-dashboard.html";
            else if (userData.role === "officer") window.location.href = "officer-dashboard.html";
            else window.location.href = "track.html";
            return;
          }
          
          renderNavigation(userData);
        } else {
          // If Firestore is slow or doc is missing, fallback to citizen
          renderNavigation({ uid: user.uid, name: user.displayName || user.email, role: "citizen" });
        }
      } catch (err) {
        console.error("Error guarding route:", err);
      }
    }
  });
}

// 5. Dynamic Navigation Bar Generator
function renderNavigation(user) {
  const navContainer = document.getElementById("navbar-container");
  if (!navContainer) return;
  
  const currentPage = window.location.pathname.split("/").pop();
  
  let navItemsHtml = `
    <li><a href="index.html" class="navbar-link ${currentPage === 'index.html' || currentPage === '' ? 'active' : ''}">Home</a></li>
    <li><a href="map.html" class="navbar-link ${currentPage === 'map.html' ? 'active' : ''}">Public Map</a></li>
  `;
  
  let userDetailsHtml = "";
  
  if (user) {
    // Authenticated links based on roles
    if (user.role === "admin") {
      navItemsHtml += `
        <li><a href="admin-dashboard.html" class="navbar-link ${currentPage === 'admin-dashboard.html' ? 'active' : ''}">Admin Control</a></li>
      `;
      userDetailsHtml = `
        <div class="navbar-user">
          <span class="user-badge role-admin">👑 Admin: ${user.name}</span>
          <button class="btn btn-sm btn-outline" onclick="logoutUser()">Logout</button>
        </div>
      `;
    } else if (user.role === "officer") {
      navItemsHtml += `
        <li><a href="officer-dashboard.html" class="navbar-link ${currentPage === 'officer-dashboard.html' ? 'active' : ''}">Officer Dashboard (${user.department})</a></li>
      `;
      userDetailsHtml = `
        <div class="navbar-user">
          <span class="user-badge role-officer">💼 Officer: ${user.name} (${user.department})</span>
          <button class="btn btn-sm btn-outline" onclick="logoutUser()">Logout</button>
        </div>
      `;
    } else {
      // Citizen
      navItemsHtml += `
        <li><a href="report.html" class="navbar-link ${currentPage === 'report.html' ? 'active' : ''}">Report Issue</a></li>
        <li><a href="track.html" class="navbar-link ${currentPage === 'track.html' ? 'active' : ''}">Track My Issues</a></li>
      `;
      userDetailsHtml = `
        <div class="navbar-user">
          <span class="user-badge role-citizen">👤 ${user.name}</span>
          <button class="btn btn-sm btn-outline" onclick="logoutUser()">Logout</button>
        </div>
      `;
    }
  } else {
    // Anonymous
    navItemsHtml += `
      <li><a href="report.html" class="navbar-link ${currentPage === 'report.html' ? 'active' : ''}">Report Issue</a></li>
    `;
    userDetailsHtml = `
      <div class="navbar-user">
        <a href="login.html" class="btn btn-sm btn-outline">Login</a>
        <a href="signup.html" class="btn btn-sm btn-primary">Sign Up</a>
      </div>
    `;
  }
  
  // Add Settings Gear Icon to all navbar views
  const settingsBtnHtml = `
    <li><a href="#" class="navbar-link" onclick="toggleSettingsPanel(true); return false;" title="Developer Settings">⚙️</a></li>
  `;
  
  navContainer.innerHTML = `
    <nav class="navbar">
      <a href="index.html" class="navbar-brand">
        Civic<span>Fix</span>
      </a>
      <ul class="navbar-menu">
        ${navItemsHtml}
        ${settingsBtnHtml}
      </ul>
      ${userDetailsHtml}
    </nav>
  `;
}

// Automatically start checking session state
document.addEventListener("DOMContentLoaded", () => {
  // Extract required roles based on current page
  const page = window.location.pathname.split("/").pop();
  let requiredRoles = [];
  if (page === "officer-dashboard.html") {
    requiredRoles = ["officer", "admin"];
  } else if (page === "admin-dashboard.html") {
    requiredRoles = ["admin"];
  } else if (["report.html", "track.html"].includes(page)) {
    requiredRoles = ["citizen", "officer", "admin"]; // any logged in user can report or track
  }
  
  guardRoute(requiredRoles);
});
