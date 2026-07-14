// CivicFix Municipal Admin Dashboard Logic
// Handles statistics computation, Chart.js renderings, issues search tables, and personnel settings updates.

let allTickets = [];
let allUsers = [];

// Chart references
let chartCategories = null;
let chartStatus = null;
let chartDepts = null;

document.addEventListener("DOMContentLoaded", () => {
  if (!auth) return;

  // 1. Guard route and verify admin credentials
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists && userDoc.data().role === "admin") {
          initializeAdminDashboard();
        } else {
          showToast("Access Denied: Admin role required.", "error");
          window.location.href = "index.html";
        }
      } catch (err) {
        console.error("Admin verification failed:", err);
      }
    }
  });

  // 2. Tab Navigation switching
  setupTabControls();

  // 3. Setup Ticket Filters
  setupTicketFilters();
});

// Setup admin sidebar tab toggle clicks
function setupTabControls() {
  const tabs = {
    "tab-analytics": "section-analytics",
    "tab-tickets": "section-tickets",
    "tab-users": "section-users"
  };

  Object.keys(tabs).forEach((tabId) => {
    document.getElementById(tabId).addEventListener("click", (e) => {
      // Remove active classes
      document.querySelectorAll(".admin-tab").forEach(btn => btn.classList.remove("active"));
      // Add active class
      e.target.classList.add("active");

      // Hide all sections
      Object.values(tabs).forEach(secId => document.getElementById(secId).style.display = "none");
      // Show selected section
      document.getElementById(tabs[tabId]).style.display = "block";
    });
  });
}

function setupTicketFilters() {
  document.getElementById("ticket-search").addEventListener("input", renderTicketsTable);
  document.getElementById("ticket-filter-category").addEventListener("change", renderTicketsTable);
  document.getElementById("ticket-filter-dept").addEventListener("change", renderTicketsTable);
  document.getElementById("ticket-filter-status").addEventListener("change", renderTicketsTable);
}

// Connect listeners to Firestore collection hooks
function initializeAdminDashboard() {
  if (!db) return;

  // 1. Listen to issues
  db.collection("issues").onSnapshot((snapshot) => {
    allTickets = [];
    snapshot.forEach((doc) => {
      allTickets.push({ id: doc.id, ...doc.data() });
    });
    
    // Sort tickets client side by default
    allTickets.sort((a, b) => {
      const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
      const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
      return dateB - dateA;
    });

    computeSystemMetrics();
    renderCharts();
    renderTicketsTable();
  }, (err) => {
    console.error("Admin tickets listener failed:", err);
  });

  // 2. Listen to users
  db.collection("users").onSnapshot((snapshot) => {
    allUsers = [];
    snapshot.forEach((doc) => {
      allUsers.push({ id: doc.id, ...doc.data() });
    });
    renderUsersTable();
  }, (err) => {
    console.error("Admin users listener failed:", err);
  });
}

// Computes analytic sums & resolution averages
function computeSystemMetrics() {
  const total = allTickets.length;
  let resolved = 0;
  let open = 0;
  let totalResolutionTimeMs = 0;
  let resolvedWithTimeCount = 0;

  allTickets.forEach((t) => {
    if (t.status === "Resolved") {
      resolved++;
      if (t.createdAt && t.resolvedAt) {
        const createDate = t.createdAt.toDate();
        const resolveDate = t.resolvedAt.toDate();
        const diff = resolveDate - createDate;
        if (diff > 0) {
          totalResolutionTimeMs += diff;
          resolvedWithTimeCount++;
        }
      }
    } else {
      open++;
    }
  });

  // Calculate Average Resolution Duration
  let avgTimeString = "--";
  if (resolvedWithTimeCount > 0) {
    const avgMs = totalResolutionTimeMs / resolvedWithTimeCount;
    const avgHours = avgMs / (1000 * 60 * 60);
    if (avgHours < 24) {
      avgTimeString = `${avgHours.toFixed(1)} hrs`;
    } else {
      const avgDays = avgHours / 24;
      avgTimeString = `${avgDays.toFixed(1)} days`;
    }
  }

  document.getElementById("metric-total").innerText = total;
  document.getElementById("metric-open").innerText = open;
  document.getElementById("metric-resolved").innerText = `${resolved} (${total > 0 ? Math.round((resolved/total)*100) : 0}%)`;
  document.getElementById("metric-avgtime").innerText = avgTimeString;
}

// Render dynamic Chart.js dashboards
function renderCharts() {
  // 1. Gather raw data counts
  const categoryCounts = { Pothole: 0, Garbage: 0, Streetlight: 0, "Sewage/Water Leakage": 0, Other: 0 };
  const statusCounts = { Submitted: 0, Acknowledged: 0, "In Progress": 0, Resolved: 0 };
  const deptCounts = { PWD: 0, Sanitation: 0, Electricity: 0, Water: 0 };

  allTickets.forEach((t) => {
    if (categoryCounts[t.category] !== undefined) categoryCounts[t.category]++;
    if (statusCounts[t.status] !== undefined) statusCounts[t.status]++;
    if (deptCounts[t.department] !== undefined) deptCounts[t.department]++;
  });

  // Destroy previous chart instances to avoid hover redraw glitches
  if (chartCategories) chartCategories.destroy();
  if (chartStatus) chartStatus.destroy();
  if (chartDepts) chartDepts.destroy();

  // Color Palettes
  const palette = {
    blues: ["#1e3a8a", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"],
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#0284c7"
  };

  // Render Category Bar Chart
  const ctxCat = document.getElementById("chart-categories").getContext("2d");
  chartCategories = new Chart(ctxCat, {
    type: "bar",
    data: {
      labels: Object.keys(categoryCounts),
      datasets: [{
        label: "Tickets Count",
        data: Object.values(categoryCounts),
        backgroundColor: palette.blues[2],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  // Render Status Pie Chart
  const ctxStat = document.getElementById("chart-status").getContext("2d");
  chartStatus = new Chart(ctxStat, {
    type: "doughnut",
    data: {
      labels: Object.keys(statusCounts),
      datasets: [{
        data: Object.values(statusCounts),
        backgroundColor: [palette.info, palette.blues[0], palette.warning, palette.success],
        borderWidth: 2,
        borderColor: "#ffffff"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { family: "Outfit" } } } }
    }
  });

  // Render Department Workloads Horizontal Bar Chart
  const ctxDept = document.getElementById("chart-departments").getContext("2d");
  chartDepts = new Chart(ctxDept, {
    type: "bar",
    data: {
      labels: Object.keys(deptCounts),
      datasets: [{
        label: "Tickets Load",
        data: Object.values(deptCounts),
        backgroundColor: "#0f766e",
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

// Render ticket listing table with search/filters applied
function renderTicketsTable() {
  const container = document.getElementById("tickets-table-body");
  if (!container) return;

  const searchVal = document.getElementById("ticket-search").value.toLowerCase().trim();
  const categoryFilter = document.getElementById("ticket-filter-category").value;
  const deptFilter = document.getElementById("ticket-filter-dept").value;
  const statusFilter = document.getElementById("ticket-filter-status").value;

  const filtered = allTickets.filter((t) => {
    const matchesSearch = !searchVal || t.description.toLowerCase().includes(searchVal);
    const matchesCategory = categoryFilter === "ALL" || t.category === categoryFilter;
    const matchesDept = deptFilter === "ALL" || t.department === deptFilter;
    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    return matchesSearch && matchesCategory && matchesDept && matchesStatus;
  });

  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; color:var(--text-muted-dark); padding:2rem;">
          No matching tickets found.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach((t) => {
    const tr = document.createElement("tr");
    
    const dateStr = t.createdAt ? t.createdAt.toDate().toLocaleDateString(undefined, {
      month: "short", day: "numeric", hour: "2-digit"
    }) : "Pending";
    
    const briefDesc = t.description.length > 50 ? t.description.substring(0, 47) + "..." : t.description;

    tr.innerHTML = `
      <td><span class="role-badge" style="background:#dbeafe; color:#1e40af;">${t.category}</span></td>
      <td title="${t.description}">${briefDesc}</td>
      <td><strong>${t.department}</strong></td>
      <td><span class="issue-badge badge-${t.status.toLowerCase().replace(" ", "")}" style="font-size:0.75rem; padding:0.15rem 0.4rem; position:static;">${t.status}</span></td>
      <td><span style="font-weight:700;">${t.duplicateCount || 1}</span></td>
      <td><span style="font-size:0.8rem; color:var(--text-muted-dark);">${dateStr}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="openDetailsModal('${t.id}')">
          👁️ Inspect
        </button>
      </td>
    `;
    container.appendChild(tr);
  });
}

// Render administrative settings users roles table
function renderUsersTable() {
  const container = document.getElementById("users-table-body");
  if (!container) return;

  container.innerHTML = "";

  if (allUsers.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:var(--text-muted-dark); padding:2rem;">
          No registered user documents found.
        </td>
      </tr>
    `;
    return;
  }

  allUsers.forEach((u) => {
    const tr = document.createElement("tr");
    
    const isCitizenSelected = u.role === "citizen" ? "selected" : "";
    const isOfficerSelected = u.role === "officer" ? "selected" : "";
    const isAdminSelected = u.role === "admin" ? "selected" : "";

    const isNoneDept = !u.department ? "selected" : "";
    const isPwdDept = u.department === "PWD" ? "selected" : "";
    const isSanDept = u.department === "Sanitation" ? "selected" : "";
    const isElecDept = u.department === "Electricity" ? "selected" : "";
    const isWatDept = u.department === "Water" ? "selected" : "";

    tr.innerHTML = `
      <td style="font-weight:600;">${u.name}</td>
      <td style="font-size:0.85rem; color:var(--text-muted-dark);">${u.email}</td>
      <td><span class="role-badge role-${u.role}">${u.role}</span></td>
      <td>
        <select id="user-dept-${u.uid}" class="form-control" style="padding:0.25rem 0.5rem; font-size:0.8rem; width:140px;" ${u.role !== 'officer' ? 'disabled' : ''}>
          <option value="" ${isNoneDept}>None</option>
          <option value="PWD" ${isPwdDept}>PWD (Roads)</option>
          <option value="Sanitation" ${isSanDept}>Sanitation (Garbage)</option>
          <option value="Electricity" ${isElecDept}>Electricity (Lights)</option>
          <option value="Water" ${isWatDept}>Water (Leaks)</option>
        </select>
      </td>
      <td>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <select id="user-role-${u.uid}" class="form-control" style="padding:0.25rem 0.5rem; font-size:0.8rem; width:110px;" onchange="toggleDeptSelector('${u.uid}', this.value)">
            <option value="citizen" ${isCitizenSelected}>Citizen</option>
            <option value="officer" ${isOfficerSelected}>Officer</option>
            <option value="admin" ${isAdminSelected}>Admin</option>
          </select>
          <button class="btn btn-primary btn-sm" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="saveUserRole('${u.uid}')">
            💾 Save
          </button>
        </div>
      </td>
    `;
    container.appendChild(tr);
  });
}

// User dept selector toggle helper when changing roles
function toggleDeptSelector(uid, role) {
  const selectDept = document.getElementById(`user-dept-${uid}`);
  if (!selectDept) return;
  if (role === "officer") {
    selectDept.disabled = false;
    selectDept.value = "PWD"; // Default fallback assigned
  } else {
    selectDept.value = "";
    selectDept.disabled = true;
  }
}

// Promotes/demotes user document records
async function saveUserRole(uid) {
  if (!db) return;
  
  const roleSelect = document.getElementById(`user-role-${uid}`);
  const deptSelect = document.getElementById(`user-dept-${uid}`);
  
  if (!roleSelect || !deptSelect) return;
  
  const newRole = roleSelect.value;
  const newDept = deptSelect.value;
  
  try {
    showToast("Updating user account records...", "info");
    await db.collection("users").doc(uid).update({
      role: newRole,
      department: newRole === "officer" ? newDept : ""
    });
    showToast("User roles updated successfully.", "success");
  } catch (err) {
    showToast("Update failed: " + err.message, "error");
  }
}

// Inspection Modal Popups
function openDetailsModal(ticketId) {
  const ticket = allTickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const modalBody = document.getElementById("details-modal-body");
  
  const dateStr = ticket.createdAt ? ticket.createdAt.toDate().toLocaleString() : "Pending";
  const resolvedStr = ticket.resolvedAt ? ticket.resolvedAt.toDate().toLocaleString() : "N/A";
  
  let proofPhotoBlock = "";
  if (ticket.status === "Resolved" && ticket.afterPhotoURL) {
    proofPhotoBlock = `
      <div style="margin-top: 1rem; border-top: 1px solid var(--border-light); padding-top: 1rem;">
        <p style="font-weight:700; color:var(--success); margin-bottom: 0.5rem;">Resolution Proof Verification Snapshot:</p>
        <img src="${ticket.afterPhotoURL}" style="width:100%; border-radius: var(--radius-md); border: 2px solid var(--success); max-height:220px; object-fit:cover;">
        <p style="font-size:0.8rem; color:var(--text-muted-dark); margin-top:0.25rem;">Resolved on: ${resolvedStr}</p>
      </div>
    `;
  }

  // Populate dynamic dropdown parameters
  modalBody.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <span class="role-badge" style="background:var(--primary); color:white; font-size:0.8rem;">${ticket.category} Ticket</span>
      <span class="issue-badge badge-${ticket.status.toLowerCase().replace(" ", "")}" style="position:static;">${ticket.status}</span>
    </div>
    
    <div style="margin-bottom:1rem; border-radius:var(--radius-md); overflow:hidden; max-height:220px;">
      <img src="${ticket.photoURL}" style="width:100%; object-fit:cover; max-height:220px;">
    </div>
    
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem; font-size:0.85rem;">
      <div>
        <p><strong>Reported On:</strong> ${dateStr}</p>
        <p><strong>Coordinates:</strong> ${ticket.lat.toFixed(5)}, ${ticket.lng.toFixed(5)}</p>
      </div>
      <div>
        <p><strong>Supporting Votes:</strong> ${ticket.duplicateCount || 1}</p>
        <p><strong>Assigned Dept:</strong> ${ticket.department}</p>
      </div>
    </div>
    
    <div class="form-group">
      <label class="form-label" style="font-weight:700;">Issue Description</label>
      <p style="font-size:0.9rem; color:var(--text-muted-dark); background:#f8fafc; padding:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border-light);">
        ${ticket.description}
      </p>
    </div>
    
    ${proofPhotoBlock}
    
    <!-- Admin Override Action form -->
    <div style="background-color: var(--light-bg); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--border-light); margin-top:1.5rem;">
      <h5 style="font-weight:700; color:var(--primary); margin-bottom:0.75rem;">Administrative Overwrite Tools</h5>
      <div class="grid-2" style="gap:1rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" style="font-size:0.75rem;">Modify Department Route</label>
          <select id="modal-override-dept" class="form-control" style="padding:0.4rem 0.5rem; font-size:0.8rem;">
            <option value="PWD" ${ticket.department === 'PWD' ? 'selected' : ''}>PWD</option>
            <option value="Sanitation" ${ticket.department === 'Sanitation' ? 'selected' : ''}>Sanitation</option>
            <option value="Electricity" ${ticket.department === 'Electricity' ? 'selected' : ''}>Electricity</option>
            <option value="Water" ${ticket.department === 'Water' ? 'selected' : ''}>Water</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" style="font-size:0.75rem;">Override Status Code</label>
          <select id="modal-override-status" class="form-control" style="padding:0.4rem 0.5rem; font-size:0.8rem;">
            <option value="Submitted" ${ticket.status === 'Submitted' ? 'selected' : ''}>Submitted</option>
            <option value="Acknowledged" ${ticket.status === 'Acknowledged' ? 'selected' : ''}>Acknowledged</option>
            <option value="In Progress" ${ticket.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="Resolved" ${ticket.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" style="width:100%; margin-top: 1rem; font-size:0.8rem; padding:0.5rem 1rem;" onclick="saveOverrideActions('${ticket.id}')">
        Apply Administration Override
      </button>
    </div>
  `;

  document.getElementById("details-modal-overlay").style.display = "flex";
}

function closeDetailsModal() {
  document.getElementById("details-modal-overlay").style.display = "none";
}

// Save Admin Manual Overrides for issue
async function saveOverrideActions(ticketId) {
  if (!db) return;
  const newDept = document.getElementById("modal-override-dept").value;
  const newStatus = document.getElementById("modal-override-status").value;

  try {
    showToast("Applying administrative overrides...", "info");
    
    const updateObj = {
      department: newDept,
      status: newStatus
    };
    
    // If setting to Resolved manually and resolvedAt is empty, set timestamp
    if (newStatus === "Resolved") {
      updateObj.resolvedAt = firebase.firestore.FieldValue.serverTimestamp();
    }
    
    await db.collection("issues").doc(ticketId).update(updateObj);
    
    showToast("Overrides applied successfully.", "success");
    closeDetailsModal();
  } catch (err) {
    showToast("Override failed: " + err.message, "error");
  }
}

// Bind override functions globally
window.toggleDeptSelector = toggleDeptSelector;
window.saveUserRole = saveUserRole;
window.saveOverrideActions = saveOverrideActions;

// Mock database values for offline admin previewing
function loadMockAdminData() {
  console.log("Offline Mode: Mocking admin database feeds.");
}
