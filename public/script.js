// ====================================================================
// Full final script.js (updated forecast UI with mini charts)
// Requires: Chart.js included in HTML and Firebase + Gemini loaded as before
// Keep <script type="module" src="script.js"></script> in your HTML
// ====================================================================

import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ---------------------------
// FIREBASE & APP SETUP
// ---------------------------
const firebaseConfig = {
    apiKey: "AIzaSyAFMCzgTrptchIhSSG8Vdx111T3zMpht6A",
    authDomain: "financial-dashboard-app-cbbf4.firebaseapp.com",
    projectId: "financial-dashboard-app-cbbf4",
    storageBucket: "financial-dashboard-app-cbbf4.firebasestorage.app",
    messagingSenderId: "655956146251",
    appId: "1:655956146251:web:b435ce1fbdfa9a34f4f5ce",
    measurementId: "G-02L6EP6ZKM",
};

if (!firebase.apps || firebase.apps.length === 0) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------------------------
// APP STATE
// ---------------------------
let currentUserId = null;
let currentUserName = "Guest";
let balance = 0, income = 0, expenses = 0;
let categoryExpenses = {};
let dailyLimit = 10000;
let conversationHistory = [];
const SAVE_CHAT_TO_DB = true;

// ---------------------------
// Gemini (client-side; dev only — keep key server-side in production)
// ---------------------------
const GEMINI_API_KEY = "AIzaSyDR1rQbIpwyGxSPKvPUhYELHokQiEVRSk4";
let gemini = null;
let geminiModel = "gemini-2.0-flash";
try { gemini = new GoogleGenerativeAI(GEMINI_API_KEY); console.log("Gemini initialized"); }
catch (e) { console.error("Gemini init failed:", e); }

// ---------------------------
// DOM helpers & selections
// ---------------------------
const $ = sel => document.querySelector(sel);
const pick = (...ids) => ids.map(id => document.getElementById(id)).find(el => el !== null);

// base UI
const appDashboard = $("#app-dashboard");
const authModal = $("#authModal");
const authForm = $("#authForm");
const authTitle = $("#authTitle");
const authSubmitBtn = $("#authSubmitBtn");
const authMessage = $("#authMessage");
const toggleSignupLink = $("#toggleSignup");

const userNameEl = $("#userName");
const balanceEl = document.querySelector(".amount");
const incomeEl = document.querySelector(".income span");
const expensesEl = document.querySelector(".expenses span");
const netSavingsEl = $("#netSavingsEl");
const limitProgressEl = $("#limitProgress");

// transaction modal
const addBtn = document.querySelector(".add-transaction");
const transactionModal = $("#transactionModal");
const closeModal = $("#closeModal");
const transactionForm = $("#transactionForm");
const typeSelect = $("#type");
const categorySelect = $("#category");
const amountInput = $("#amount");
const descriptionInput = $("#description");
const saveTransactionBtn = $("#saveTransactionBtn");

// lists
const transactionList = $("#transactionList");
const allTransactionList = $("#allTransactionList");

// settings
const userSettingsForm = $("#userSettingsForm");
const displayNameInput = $("#displayName");
const dailyLimitInput = $("#dailyLimitInput");

// logout
const logoutBtn = $("#logoutBtn");
const logoutConfirmModal = $("#logoutConfirmModal");
const confirmLogoutBtn = $("#confirmLogoutBtn");
const cancelLogoutBtn = $("#cancelLogoutBtn");

// reports/trend elements
const generateReportBtn = $("#generateReportBtn") || $("#generate-report-btn");
const viewTrendBtn = $("#viewTrendBtn") || $("#view-trend-btn");
const reportOutput = $("#reportOutput") || $("#report-output");
const trendCanvas = document.getElementById("trendChart");
let trendChartInstance = null;

// optional table
let transactionTable = $("#transactionTable");

// toast
const toastNotification = $("#toastNotification");

// AI chat
const aiChatForm = $("#aiChatForm") || $("#ai-chat-form") || pick("aiChatForm", "ai-chat-form");
const aiQuestionInput = $("#aiQuestionInput") || $("#ai-chat-input") || pick("aiQuestionInput", "ai-chat-input");
const aiChatOutput = $("#aiChatOutput") || $("#ai-chat-output") || pick("aiChatOutput", "ai-chat-output");

// dashboard chart
const expensesChartCanvas = document.getElementById("expensesChart");
const expensesChartCtx = expensesChartCanvas ? expensesChartCanvas.getContext("2d") : null;
let expensesChart = null;

// ---------------------------
// Utilities
// ---------------------------
const formatCurrency = (amount = 0) => {
    const n = Number(amount) || 0;
    return `KSh ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};
const showToast = (message, isSuccess = true) => {
    if (!toastNotification) { console.log(message); return; }
    toastNotification.textContent = (isSuccess ? "✅ " : "❌ ") + message;
    toastNotification.classList.add("show");
    setTimeout(() => toastNotification.classList.remove("show"), 3200);
};
const safeText = s => (s === undefined || s === null) ? "" : String(s);

// ---------------------------
// Charts (dashboard / trend)
// ---------------------------
const initExpensesChart = () => {
    if (!expensesChartCtx) return;
    if (expensesChart) expensesChart.destroy();
    const grad = expensesChartCtx.createLinearGradient(0, 0, 0, 400);
    grad.addColorStop(0, "rgba(37,99,235,0.95)");
    grad.addColorStop(1, "rgba(99,102,241,0.6)");
    expensesChart = new Chart(expensesChartCtx, {
        type: "bar",
        data: { labels: Object.keys(categoryExpenses), datasets: [{ label: "Expenses", data: Object.values(categoryExpenses), backgroundColor: grad, borderRadius: 6 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
};
const updateExpensesChart = () => {
    if (!expensesChart) return initExpensesChart();
    expensesChart.data.labels = Object.keys(categoryExpenses);
    expensesChart.data.datasets[0].data = Object.values(categoryExpenses);
    expensesChart.update();
};
const renderTrendChart = (labels = [], incomeData = [], expenseData = []) => {
    if (!trendCanvas) return;
    const ctx = trendCanvas.getContext("2d");
    if (trendChartInstance) trendChartInstance.destroy();
    trendChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels, datasets: [
                { label: "Income", data: incomeData, borderColor: "rgba(16,185,129,0.9)", tension: 0.25, fill: false },
                { label: "Expense", data: expenseData, borderColor: "rgba(239,68,68,0.9)", tension: 0.25, fill: false }
            ]
        },
        options: { responsive: true, plugins: { legend: { position: "top" } }, scales: { y: { beginAtZero: true } } }
    });
    if (reportOutput) { reportOutput.classList.remove("fade-in"); void reportOutput.offsetWidth; reportOutput.classList.add("fade-in"); }
};

// ---------------------------
// Firestore: transactions (global collection pattern)
// ---------------------------
const addTransactionGlobal = async tx => {
    try {
        const payload = {
            userId: tx.userId,
            type: tx.type,
            category: tx.category,
            amount: Number(tx.amount) || 0,
            description: tx.description || "",
            date: tx.date ? (tx.date instanceof Date ? tx.date : new Date(tx.date)) : new Date(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection("transactions").add(payload);
        return { success: true };
    } catch (err) { console.error("addTransactionGlobal:", err); return { success: false, error: err }; }
};
const getTransactionsForUser = async (userId, filters = {}) => {
    try {
        let q = db.collection("transactions").where("userId", "==", userId);
        if (filters.type && filters.type !== "all") q = q.where("type", "==", filters.type);
        if (filters.category && filters.category !== "all") q = q.where("category", "==", filters.category);
        if (filters.startDate) q = q.where("date", ">=", filters.startDate instanceof Date ? filters.startDate : new Date(filters.startDate));
        if (filters.endDate) q = q.where("date", "<=", filters.endDate instanceof Date ? filters.endDate : new Date(filters.endDate));
        q = q.orderBy("date", "desc");
        if (filters.limit) q = q.limit(filters.limit);
        const snap = await q.get();
        return snap.docs.map(d => {
            const data = d.data();
            let dt = null;
            if (data.date) dt = data.date.toDate ? data.date.toDate() : new Date(data.date);
            return { id: d.id, ...data, date: dt };
        });
    } catch (err) { console.error("getTransactionsForUser:", err); return []; }
};

// real-time subscribe
let userTxUnsubscribe = null;
const subscribeToUserTransactions = userId => {
    if (userTxUnsubscribe) { try { userTxUnsubscribe(); } catch (e) { } userTxUnsubscribe = null; }
    const q = db.collection("transactions").where("userId", "==", userId).orderBy("date", "desc").limit(50);
    userTxUnsubscribe = q.onSnapshot(snapshot => {
        income = 0; expenses = 0; balance = 0; categoryExpenses = {};
        if (transactionList) transactionList.innerHTML = "";
        if (allTransactionList) allTransactionList.innerHTML = "";
        const txDocs = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            const tx = { id: doc.id, userId: d.userId, type: d.type, category: d.category, amount: Number(d.amount) || 0, description: d.description || "", date: d.date ? (d.date.toDate ? d.date.toDate() : new Date(d.date)) : null };
            txDocs.push(tx);
            if (tx.type === "income") income += tx.amount;
            else { expenses += tx.amount; categoryExpenses[tx.category] = (categoryExpenses[tx.category] || 0) + tx.amount; }
        });
        balance = income - expenses;
        updateUI();
        // render recent
        txDocs.slice(0, 10).forEach(tx => {
            const sign = tx.type === "income" ? "+" : "-";
            const colorClass = tx.type === "income" ? "green" : "red";
            const icon = CATEGORY_ICONS[tx.category] || CATEGORY_ICONS["Other"];
            const li = document.createElement("li");
            const dateStr = tx.date ? tx.date.toLocaleDateString() : "";
            li.innerHTML = `<span>${icon} ${safeText(tx.description)} (${tx.category}) — <small>${dateStr}</small></span><span class="${colorClass}">${sign}${formatCurrency(tx.amount)}</span>`;
            transactionList && transactionList.appendChild(li);
        });
        txDocs.forEach(tx => {
            const sign = tx.type === "income" ? "+" : "-";
            const colorClass = tx.type === "income" ? "green" : "red";
            const icon = CATEGORY_ICONS[tx.category] || CATEGORY_ICONS["Other"];
            const li = document.createElement("li");
            li.innerHTML = `<span>${icon} ${safeText(tx.description)} (${tx.category})</span><span class="${colorClass}">${sign}${formatCurrency(tx.amount)}</span>`;
            allTransactionList && allTransactionList.appendChild(li);
        });
        if (transactionTable) {
            const rows = txDocs.map(t => `<tr><td>${t.date ? t.date.toLocaleDateString() : ""}</td><td>${t.type}</td><td>${t.category}</td><td>${formatCurrency(t.amount)}</td><td>${safeText(t.description)}</td></tr>`).join("");
            transactionTable.innerHTML = `<tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Note</th></tr>${rows}`;
        }
        updateExpensesChart();
    }, err => console.error("Realtime tx listener:", err));
};

// ---------------------------
// UI helpers, updateUI
// ---------------------------
const CATEGORY_ICONS = { "Travel": "✈️", "Food": "🍔", "Groceries": "🛒", "Shopping": "🛍️", "Utilities": "💡", "Entertainment": "🍿", "Salary": "💰", "Investment": "📈", "Other": "🏷️" };

const updateLimitProgressUI = () => {
    if (!limitProgressEl) return;
    const expenseTotal = expenses;
    const progressPercent = Math.min((expenseTotal / (dailyLimit || 1)) * 100, 100);
    limitProgressEl.style.width = `${progressPercent}%`;
    const limitCard = document.querySelector('.limit-card');
    if (limitCard) {
        const limitUsed = limitCard.querySelector('p:first-of-type');
        if (limitUsed) limitUsed.textContent = `${formatCurrency(expenseTotal)} Used`;
        const small = limitCard.querySelector('.small-text');
        if (small) small.textContent = `${(100 - progressPercent).toFixed(0)}% remaining`;
    }
    if (progressPercent > 80) limitProgressEl.classList.add('warning'); else limitProgressEl.classList.remove('warning');
};

const updateUI = () => {
    if (balanceEl) balanceEl.textContent = formatCurrency(balance);
    if (incomeEl) incomeEl.textContent = `+${formatCurrency(income)}`;
    if (expensesEl) expensesEl.textContent = `-${formatCurrency(expenses)}`;
    if (userNameEl) userNameEl.textContent = currentUserName;
    if (displayNameInput) displayNameInput.value = currentUserName;
    if (dailyLimitInput) dailyLimitInput.value = dailyLimit;
    const net = income - expenses;
    if (netSavingsEl) netSavingsEl.innerHTML = `Net Change: <span class="net-value ${net >= 0 ? 'positive' : 'negative'}">${net >= 0 ? '✅' : '⬇️'} ${formatCurrency(Math.abs(net))}</span>`;
    updateLimitProgressUI();
    updateExpensesChart();
};

// ---------------------------
// Settings handling
// ---------------------------
if (userSettingsForm) {
    userSettingsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUserId) { showToast("Please login first.", false); return; }
        const newName = displayNameInput ? displayNameInput.value.trim() : currentUserName;
        const newLimit = dailyLimitInput ? Number(dailyLimitInput.value) : dailyLimit;
        if (!newName || isNaN(newLimit) || newLimit <= 0) { showToast("Enter valid settings", false); return; }
        try {
            await db.collection("users").doc(currentUserId).set({ displayName: newName, dailyLimit: newLimit }, { merge: true });
            const user = auth.currentUser;
            if (user && user.displayName !== newName) await user.updateProfile({ displayName: newName });
            currentUserName = newName; dailyLimit = newLimit; updateUI(); showToast("Settings updated!");
        } catch (err) { console.error("Settings save:", err); showToast("Failed to save settings", false); }
    });
}
const loadUserSettings = async userId => {
    try {
        const doc = await db.collection("users").doc(userId).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.displayName) currentUserName = data.displayName;
            if (data.dailyLimit) dailyLimit = data.dailyLimit;
            updateUI();
        }
    } catch (err) { console.error("loadUserSettings:", err); }
};

// ---------------------------
// Auth handling
// ---------------------------
const toggleAppVisibility = (loggedIn, user = null) => {
    if (loggedIn && user) {
        currentUserId = user.uid;
        currentUserName = (user.displayName || user.email.split("@")[0] || "User");
        authModal && authModal.classList && authModal.classList.remove("active-modal");
        appDashboard && (appDashboard.style.display = "flex");
        loadUserSettings(currentUserId);
        subscribeToUserTransactions(currentUserId);
    } else {
        if (userTxUnsubscribe) { try { userTxUnsubscribe(); } catch (e) { } userTxUnsubscribe = null; }
        currentUserId = null; currentUserName = "Guest";
        authModal && authModal.classList && authModal.classList.add("active-modal");
        appDashboard && (appDashboard.style.display = "none");
        balance = income = expenses = 0; categoryExpenses = {};
        if (transactionList) transactionList.innerHTML = ""; if (allTransactionList) allTransactionList.innerHTML = "";
        if (transactionTable) transactionTable.innerHTML = ""; updateUI();
        if (expensesChart) { try { expensesChart.destroy(); } catch (e) { } expensesChart = null; }
    }
};
auth.onAuthStateChanged(user => { if (user) toggleAppVisibility(true, user); else toggleAppVisibility(false); });

// auth form submit (sign up / login handled via title toggle)
if (authForm) {
    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("authEmail").value;
        const password = document.getElementById("authPassword").value;
        const confirmPassword = document.getElementById("authConfirmPassword") ? document.getElementById("authConfirmPassword").value : null;
        authMessage && (authMessage.style.display = "none");
        const isSignupMode = authTitle && authTitle.textContent && authTitle.textContent.toLowerCase().includes("create");
        if (isSignupMode) {
            if (password !== confirmPassword) { if (authMessage) { authMessage.style.display = "block"; authMessage.textContent = "Passwords do not match."; } return; }
            try { await auth.createUserWithEmailAndPassword(email, password); } catch (err) { if (authMessage) { authMessage.style.display = "block"; authMessage.textContent = err.message; } }
        } else {
            try { await auth.signInWithEmailAndPassword(email, password); } catch (err) { if (authMessage) { authMessage.style.display = "block"; authMessage.textContent = "Login failed: " + err.message; } }
        }
    });
}

// logout
if (logoutBtn) logoutBtn.addEventListener("click", () => logoutConfirmModal.style.display = "flex");
if (confirmLogoutBtn) confirmLogoutBtn.addEventListener("click", async () => { logoutConfirmModal.style.display = "none"; try { await auth.signOut(); } catch (e) { console.error(e); } });
if (cancelLogoutBtn) cancelLogoutBtn.addEventListener("click", () => logoutConfirmModal.style.display = "none");
// toggle signup link
if (toggleSignupLink) toggleSignupLink.addEventListener("click", (e) => { e.preventDefault(); const isSignup = authTitle && authTitle.textContent && authTitle.textContent.toLowerCase().includes("create"); if (isSignup) { authTitle.textContent = "Login to Financial Dashboard"; authSubmitBtn && (authSubmitBtn.textContent = "Login"); confirmPasswordGroup && (confirmPasswordGroup.style.display = "none"); toggleSignupLink.innerHTML = "Sign Up"; } else { authTitle.textContent = "Create a New Account"; authSubmitBtn && (authSubmitBtn.textContent = "Sign Up"); confirmPasswordGroup && (confirmPasswordGroup.style.display = "block"); toggleSignupLink.innerHTML = "Log In"; } });

// ---------------------------
// Transaction form handling
// ---------------------------
if (typeSelect) typeSelect.addEventListener("change", () => {
    const isIncome = typeSelect.value === "income";
    if (saveTransactionBtn) saveTransactionBtn.textContent = isIncome ? "Record Income" : "Save Expense";
    if (categorySelect) {
        const options = categorySelect.querySelectorAll("option");
        options.forEach(o => {
            const optionType = o.getAttribute("data-type");
            if (isIncome && !optionType) o.style.display = "none";
            else if (!isIncome && optionType) o.style.display = "none";
            else o.style.display = "block";
        });
        if (categorySelect.selectedOptions && categorySelect.selectedOptions[0] && categorySelect.selectedOptions[0].style.display === 'none') categorySelect.value = isIncome ? 'Salary' : 'Food';
    }
});
if (addBtn) addBtn.addEventListener("click", () => { transactionForm && transactionForm.reset(); transactionModal && (transactionModal.style.display = "flex"); });
if (closeModal) closeModal.addEventListener("click", () => transactionModal && (transactionModal.style.display = "none"));

if (transactionForm) transactionForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentUserId) { alert("Please log in to add transactions."); return; }
    const description = descriptionInput ? descriptionInput.value.trim() : "";
    const amount = amountInput ? parseFloat(amountInput.value) : NaN;
    const type = typeSelect ? typeSelect.value : "expense";
    const category = categorySelect ? categorySelect.value : "Other";
    if (isNaN(amount) || amount <= 0) { alert("Enter valid amount"); return; }
    const payload = { userId: currentUserId, type, category, amount, description, date: new Date() };
    const result = await addTransactionGlobal(payload);
    if (result.success) {
        showToast(`${formatCurrency(amount)} recorded for ${category}.`, true);
        if (type === "income") income += amount; else { expenses += amount; categoryExpenses[category] = (categoryExpenses[category] || 0) + amount; }
        balance = income - expenses; updateUI();
        transactionForm.reset(); transactionModal && (transactionModal.style.display = "none");
    } else showToast("Failed to save transaction.", false);
});

// ---------------------------
// Reports & filtering & summarization
// ---------------------------
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

if (generateReportBtn) generateReportBtn.addEventListener("click", async () => {
    if (!currentUserId) { alert("Please login first."); return; }
    const startDate = daysAgo(30), endDate = new Date();
    const dashboardCategorySelect = $("#filterCategory");
    const categoryFilter = dashboardCategorySelect ? dashboardCategorySelect.value : "all";
    const txs = await getTransactionsForUser(currentUserId, { startDate, endDate, limit: 1000, category: categoryFilter });
    const summary = summarizeTransactions(txs);
    const html = `<div class="report-summary fade-in"><h4>Report (Last 30 days)</h4><p><strong>Total Income:</strong> ${formatCurrency(summary.totalIncome)}</p><p><strong>Total Expense:</strong> ${formatCurrency(summary.totalExpense)}</p><p><strong>Net:</strong> ${formatCurrency(summary.balance)}</p><p><strong>Top Categories:</strong> ${summary.topCategories.map(tc => `${tc.category} (${formatCurrency(tc.amount)})`).join(", ") || "—"}</p></div>`;
    if (reportOutput) { reportOutput.innerHTML = html; reportOutput.classList.remove("fade-in"); void reportOutput.offsetWidth; reportOutput.classList.add("fade-in"); }
    categoryExpenses = summary.byCategory || {};
    if (Object.keys(categoryExpenses).length === 0) categoryExpenses = { "No Data": 0 };
    updateExpensesChart();
});

if (viewTrendBtn) viewTrendBtn.addEventListener("click", async () => {
    if (!currentUserId) { alert("Please login first."); return; }
    const months = 6;
    const allTx = await getTransactionsForUser(currentUserId, { limit: 2000 });
    const now = new Date();
    const labels = [];
    const incomeData = [], expenseData = [];
    for (let i = months - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    labels.forEach(label => {
        const [y, m] = label.split("-");
        const start = new Date(Number(y), Number(m) - 1, 1);
        const end = new Date(Number(y), Number(m), 0, 23, 59, 59, 999);
        const txsInMonth = allTx.filter(t => { const td = t.date instanceof Date ? t.date : (t.date && t.date.toDate ? t.date.toDate() : new Date(t.date)); return td >= start && td <= end; });
        incomeData.push(txsInMonth.filter(t => t.type === "income").reduce((s, r) => s + (r.amount || 0), 0));
        expenseData.push(txsInMonth.filter(t => t.type === "expense").reduce((s, r) => s + (r.amount || 0), 0));
    });
    renderTrendChart(labels, incomeData, expenseData);
    const totalIncome = incomeData.reduce((s, v) => s + v, 0), totalExpense = expenseData.reduce((s, v) => s + v, 0);
    const html = `<div class="report-summary fade-in"><h4>Trend (Last ${labels.length} months)</h4><p><strong>Total Income:</strong> ${formatCurrency(totalIncome)}</p><p><strong>Total Expense:</strong> ${formatCurrency(totalExpense)}</p><p><strong>Net:</strong> ${formatCurrency(totalIncome - totalExpense)}</p></div>`;
    if (reportOutput) { reportOutput.innerHTML = html; reportOutput.classList.remove("fade-in"); void reportOutput.offsetWidth; reportOutput.classList.add("fade-in"); }
});

function summarizeTransactions(transactions) {
    const byCategory = {}; let totalIncome = 0, totalExpense = 0;
    transactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === "income") totalIncome += amt;
        else { totalExpense += amt; byCategory[t.category] = (byCategory[t.category] || 0) + amt; }
    });
    const balanceLocal = totalIncome - totalExpense;
    const topCategories = Object.entries(byCategory).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
    return { totalIncome, totalExpense, balance: balanceLocal, byCategory, topCategories };
}

// ---------------------------
// AI: Chat & Predictive insights
// ---------------------------
const saveChatToDb = async (userId, role, text) => {
    if (!SAVE_CHAT_TO_DB || !userId) return;
    try { await db.collection("chats").add({ userId, role, text, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); }
    catch (e) { console.error("saveChatToDb:", e); }
};

const getAIFinancialAdvice = async userQuestion => {
    if (!gemini) return "AI unavailable.";
    conversationHistory.push({ role: "user", text: userQuestion });
    if (currentUserId && SAVE_CHAT_TO_DB) await saveChatToDb(currentUserId, "user", userQuestion);
    const recentTxs = await getTransactionsForUser(currentUserId, { startDate: daysAgo(90), limit: 1000 });
    const summary = summarizeTransactions(recentTxs);
    const financialContext = `Balance: ${formatCurrency(summary.balance)}; Total Income(90d): ${formatCurrency(summary.totalIncome)}; Total Expense(90d): ${formatCurrency(summary.totalExpense)}; Top: ${summary.topCategories.map(t => t.category + ":" + Math.round(t.amount)).join(", ")}`;
    const mem = conversationHistory.slice(-8).map(m => `${m.role}: ${m.text}`).join("\n");
    const systemPrompt = `You are FinCoach. Use the context to answer concisely (<=4 sentences).\nContext: ${financialContext}\nHistory: ${mem}\nQuestion: ${userQuestion}`;
    try {
        const modelInstance = gemini.getGenerativeModel({ model: geminiModel });
        const result = await modelInstance.generateContent(systemPrompt);
        let text = "";
        try {
            if (result?.response && typeof result.response.text === "function") text = await result.response.text();
            else if (result?.response && result.response.text) text = result.response.text;
            else if (result?.output_text) text = result.output_text;
            else if (result?.text) text = result.text;
            else text = JSON.stringify(result).slice(0, 800);
        } catch (e) { text = JSON.stringify(result).slice(0, 800); }
        conversationHistory.push({ role: "assistant", text });
        if (currentUserId && SAVE_CHAT_TO_DB) await saveChatToDb(currentUserId, "assistant", text);
        return text;
    } catch (err) { console.error("Gemini error:", err); return "Sorry, AI error."; }
};

const getPredictiveInsights = async () => {
    if (!gemini) return "Prediction engine unavailable.";
    // compute data client-side and also request narrative
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const txs = await getTransactionsForUser(currentUserId, { startDate: sixMonthsAgo, limit: 2000 });
    const summary = summarizeTransactions(txs);

    // simple quantitative prediction: average of last 3 months expenses
    const monthly = {}; // key YYYY-MM
    txs.forEach(t => {
        const d = t.date instanceof Date ? t.date : (t.date && t.date.toDate ? t.date.toDate() : new Date(t.date));
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthly[key] = monthly[key] || { income: 0, expense: 0 };
        monthly[key][t.type === 'income' ? 'income' : 'expense'] += Number(t.amount) || 0;
    });
    const monthsSorted = Object.keys(monthly).sort();
    // last 3 months average expense
    const last3 = monthsSorted.slice(-3);
    const avgLast3 = last3.reduce((s, k) => s + (monthly[k].expense || 0), 0) / Math.max(1, last3.length);
    const predictedNext = Math.round(avgLast3);

    // create month labels for sparkline (last 6 months + next)
    const now = new Date();
    const labels = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    const series = labels.map(l => monthly[l] ? monthly[l].expense : 0);
    const predictedSeries = series.slice(); predictedSeries.push(predictedNext);

    // build prompt for narrative (short)
    const prompt = `You are FinCoach. Given the user's last 6 months expense totals: ${JSON.stringify(series)} and predicted next month expense: ${predictedNext}, produce:
1) One-sentence concise forecast of next month's expenses (confidence),
2) One bullet risk,
3) Two actionable tips.
Return in plain text (short).`;
    let narrative = "";
    try {
        const modelInstance = gemini.getGenerativeModel({ model: geminiModel });
        const result = await modelInstance.generateContent(prompt);
        if (result?.response && typeof result.response.text === "function") narrative = await result.response.text();
        else if (result?.response && result.response.text) narrative = result.response.text;
        else narrative = result?.output_text || result?.text || "No narrative available.";
    } catch (err) {
        console.error("AI forecast narrative error:", err);
        narrative = "AI narrative unavailable — showing computed forecast instead.";
    }

    return { summary, labels, series, predictedNext, predictedSeries, narrative };
};

// AI chat wiring
if (aiChatForm) aiChatForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentUserId) { showToast("Please log in to use the AI coach.", false); return; }
    const q = (aiQuestionInput && aiQuestionInput.value) ? aiQuestionInput.value.trim() : "";
    if (!q) return;
    appendMessage('user', q);
    if (aiQuestionInput) aiQuestionInput.value = "";
    appendMessage('ai', "Thinking...");
    const aiReply = await getAIFinancialAdvice(q);
    if (aiChatOutput && aiChatOutput.lastChild) {
        const last = aiChatOutput.lastChild;
        if (last && last.textContent && last.textContent.includes("Thinking")) aiChatOutput.removeChild(last);
    }
    appendMessage('ai', aiReply);
});
function appendMessage(sender, message) {
    if (!aiChatOutput) { console.log(`${sender}: ${message}`); return; }
    const el = document.createElement("div");
    el.classList.add("chat-message", sender === "user" ? "user" : "ai");
    el.innerHTML = `<strong>${sender === "user" ? "You" : "Coach"}:</strong> ${message}`;
    aiChatOutput.appendChild(el);
    aiChatOutput.scrollTop = aiChatOutput.scrollHeight;
}

// ---------------------------
// Forecast UI rendering (mini donut + sparkline + narrative card)
// ---------------------------
let miniDonutChart = null;
let miniSparklineChart = null;

function renderForecastCard({ summary, labels, series, predictedNext, predictedSeries, narrative }) {
    if (!reportOutput) return;
    // create card HTML
    reportOutput.innerHTML = `
      <div id="forecastCard" class="forecast-card fade-in">
        <div class="forecast-top">
          <div class="forecast-stats">
            <div class="stat">
              <div class="stat-label">Avg Monthly Expense (3mo)</div>
              <div class="stat-value">${formatCurrency(Math.round((series.slice(-3).reduce((s, v) => s + v, 0) || 0) / Math.max(1, Math.min(3, series.length))))}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Predicted Next Month</div>
              <div class="stat-value">${formatCurrency(predictedNext)}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Total (6mo)</div>
              <div class="stat-value">${formatCurrency(series.reduce((s, v) => s + v, 0))}</div>
            </div>
          </div>
          <div class="forecast-charts">
            <canvas id="miniDonut" width="220" height="160"></canvas>
            <canvas id="miniSparkline" width="360" height="160"></canvas>
          </div>
        </div>
        <div class="forecast-narrative">
          <h4>AI Forecast</h4>
          <div class="narrative-text">${narrative.replace(/\n/g, "<br>")}</div>
        </div>
      </div>
    `;

    // create donut: top categories from summary.byCategory
    const donutCtx = document.getElementById("miniDonut").getContext("2d");
    const byCat = summary.byCategory || {};
    const donutLabels = Object.keys(byCat);
    const donutData = donutLabels.map(l => byCat[l] || 0);
    if (miniDonutChart) { try { miniDonutChart.destroy(); } catch (e) { } miniDonutChart = null; }
    miniDonutChart = new Chart(donutCtx, {
        type: "doughnut",
        data: { labels: donutLabels, datasets: [{ data: donutData, backgroundColor: donutLabels.map((_, i) => getColor(i)) }] },
        options: { plugins: { legend: { position: 'bottom' } }, responsive: true, maintainAspectRatio: false }
    });

    // create sparkline: series + predictedNext appended
    const sparkCtx = document.getElementById("miniSparkline").getContext("2d");
    const sparkLabels = labels.concat(["Next"]);
    const sparkData = series.concat([predictedNext]);
    if (miniSparklineChart) { try { miniSparklineChart.destroy(); } catch (e) { } miniSparklineChart = null; }
    miniSparklineChart = new Chart(sparkCtx, {
        type: "line",
        data: { labels: sparkLabels, datasets: [{ label: "Expenses", data: sparkData, borderColor: "rgba(239,68,68,0.95)", fill: true, backgroundColor: createGradient(sparkCtx) }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { display: false } }, elements: { point: { radius: 3 } } }
    });

    // helper to create gradient for sparkline
    function createGradient(ctx) {
        const g = ctx.createLinearGradient(0, 0, 0, 120);
        g.addColorStop(0, 'rgba(239,68,68,0.18)');
        g.addColorStop(1, 'rgba(239,68,68,0.02)');
        return g;
    }
    function getColor(idx) {
        const palette = ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6"];
        return palette[idx % palette.length];
    }
}

// ---------------------------
// Attach AI Forecast button (improved visual flow)
// ---------------------------
const attachPredictButtonIfMissing = () => {
    if (!document.getElementById("predictiveBtn")) {
        const reportsSection = document.getElementById("reports-section");
        if (reportsSection) {
            const btn = document.createElement("button");
            btn.id = "predictiveBtn";
            btn.className = "save-btn small";
            btn.textContent = "AI Forecast";
            btn.style.marginLeft = "10px";
            reportsSection.querySelector(".report-option") && reportsSection.appendChild(btn);
            btn.addEventListener("click", async () => {
                if (!currentUserId) { showToast("Login to get forecast", false); return; }
                showToast("Generating AI forecast — please wait...", true);
                // compute predictive insights and render a rich card
                const result = await getPredictiveInsights();
                // compute summary for donut chart too
                const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                const txs = await getTransactionsForUser(currentUserId, { startDate: sixMonthsAgo, limit: 2000 });
                const summary = summarizeTransactions(txs);
                // build labels and series for last 6 months
                const monthly = {};
                txs.forEach(t => {
                    const d = t.date instanceof Date ? t.date : (t.date && t.date.toDate ? t.date.toDate() : new Date(t.date));
                    if (!d) return;
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    monthly[key] = monthly[key] || 0;
                    if (t.type === 'expense') monthly[key] += Number(t.amount) || 0;
                });
                const now = new Date();
                const labels = [];
                const series = [];
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    labels.push(key);
                    series.push(monthly[key] || 0);
                }
                // predicted next month using getPredictiveInsights returned predictedNext if available
                const predictedNext = (typeof result.predictedNext === "number") ? result.predictedNext : Math.round(series.slice(-3).reduce((s, v) => s + v, 0) / Math.max(1, Math.min(3, series.length)));
                renderForecastCard({ summary, labels, series, predictedNext, predictedSeries: series.concat([predictedNext]), narrative: result.narrative || result });
            });
        }
    }
};
attachPredictButtonIfMissing();

// ---------------------------
// Export CSV utility (optional)
// ---------------------------
const exportTransactionsToCSV = async (filters = {}) => {
    if (!currentUserId) { showToast("Log in to export data", false); return; }
    const txs = await getTransactionsForUser(currentUserId, filters);
    if (!txs.length) { showToast("No transactions to export.", false); return; }
    const rows = txs.map(t => {
        const dateStr = t.date instanceof Date ? t.date.toISOString() : (t.date && t.date.toDate ? t.date.toDate().toISOString() : "");
        return `"${dateStr}","${t.type}","${t.category}","${t.amount}","${(t.description || "").replace(/"/g, '""')}"`;
    });
    const csv = `Date,Type,Category,Amount,Note\n${rows.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${currentUserId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};
const exportBtn = document.getElementById("exportCsvBtn");
if (exportBtn) exportBtn.addEventListener("click", () => exportTransactionsToCSV({ startDate: daysAgo(365), limit: 10000 }));

// ---------------------------
// Navigation restore patch (ensure menu toggles views)
// ---------------------------
document.addEventListener("DOMContentLoaded", () => {
    const menuItems = document.querySelectorAll(".menu li[data-section]");
    const sections = document.querySelectorAll(".content-section");
    if (!menuItems.length || !sections.length) return;
    menuItems.forEach(item => {
        item.addEventListener("click", () => {
            menuItems.forEach(i => i.classList.remove("active"));
            item.classList.add("active");
            const targetSection = item.dataset.section;
            sections.forEach(sec => sec.style.display = "none");
            document.querySelectorAll(".content-section").forEach(sec => sec.classList.remove("active-section"));
            const sectionEl = document.getElementById(targetSection);
            if (sectionEl) { sectionEl.style.display = "block"; sectionEl.classList.add("active-section"); }
            else console.error(`Section ${targetSection} not found`);
        });
    });
    const defaultSection = document.getElementById("dashboard-section");
    if (defaultSection) { defaultSection.style.display = "block"; defaultSection.classList.add("active-section"); }
});

// ---------------------------
// Init
// ---------------------------
initExpensesChart();
updateUI();
// ====================================================================
