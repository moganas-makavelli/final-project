// ====================================================================
// Full improved script.js
// - Option B: global "transactions" collection with userId field
// - Firestore storage + filtering + real-time updates
// - Conversational AI with context memory + predictive insights
// - Compatible with Firebase v8 (global firebase object loaded via CDN)
// - Requires <script type="module" src="script.js"></script> in HTML
// ====================================================================

// ---------------------------
// 0. Imports (module)
// ---------------------------
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ---------------------------
// 1. FIREBASE SETUP & INITIALIZATION (v8 style - global firebase)
// ---------------------------
const firebaseConfig = {
    apiKey: "AIzaSyAFMCzgTrptchIhSSG8Vdx111T3zMpht6A",
    authDomain: "financial-dashboard-app-cbbf4.firebaseapp.com",
    projectId: "financial-dashboard-app-cbbf4",
    storageBucket: "financial-dashboard-app-cbbf4.firebasestorage.app",
    messagingSenderId: "655956146251",
    appId: "1:655956146251:web:b435ce1fbdfa9a34f4f5ce",
    measurementId: "G-02L6EP6ZKM"
};

// Use existing global firebase loaded from CDN in your HTML
if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ---------------------------
// 2. APP STATE
// ---------------------------
let currentUserId = null;
let currentUserName = "Guest";

let balance = 0;
let income = 0;
let expenses = 0;
let categoryExpenses = {}; // aggregated by category for UI/chart
let dailyLimit = 10000;

let conversationHistory = []; // in-memory conversation for current session
const SAVE_CHAT_TO_DB = true; // set false to skip storing chats in Firestore

// ---------------------------
// 3. Gemini AI Setup
// ---------------------------
// Replace with your real key. Keep this secret on server in production.
const GEMINI_API_KEY = "AIzaSyDR1rQbIpwyGxSPKvPUhYELHokQiEVRSk4";
let gemini = null;
let geminiModel = "gemini-2.0-flash";

try {
    gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log("✅ Gemini initialized");
} catch (e) {
    console.error("Gemini init failed:", e);
}

// ---------------------------
// 4. DOM ELEMENT REFERENCES (defensive: supports variations in IDs)
// ---------------------------
const $ = (sel) => document.querySelector(sel);

// Dashboard + basic UI
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

const addBtn = document.querySelector(".add-transaction");
const transactionModal = $("#transactionModal");
const closeModal = $("#closeModal");
const transactionForm = $("#transactionForm");
const typeSelect = $("#type");
const categorySelect = $("#category");
const amountInput = $("#amount");
const descriptionInput = $("#description");
const saveTransactionBtn = $("#saveTransactionBtn");

const transactionList = $("#transactionList");
const allTransactionList = $("#allTransactionList");

// Settings
const userSettingsForm = $("#userSettingsForm");
const displayNameInput = $("#displayName");
const dailyLimitInput = $("#dailyLimitInput");

// Logout
const logoutBtn = $("#logoutBtn");
const logoutConfirmModal = $("#logoutConfirmModal");
const confirmLogoutBtn = $("#confirmLogoutBtn");
const cancelLogoutBtn = $("#cancelLogoutBtn");

// Reports & Trend
const generateReportBtn = $("#generate-report-btn");
const viewTrendBtn = $("#view-trend-btn");
const reportOutput = $("#report-output");
const trendCanvas = $("#trendChart");
let trendChartInstance = null;

// Transaction table (optional)
let transactionTable = $("#transactionTable"); // optional table in HTML

// Toast
const toastNotification = $("#toastNotification");

// AI Chat elements (support both hyphenated and camelCase IDs)
const aiChatForm = $("#aiChatForm") || $("#ai-chat-form") || $("#aiChatForm");
const aiQuestionInput = $("#aiQuestionInput") || $("#ai-chat-input");
const aiChatOutput = $("#aiChatOutput") || $("#ai-chat-output") || $("#aiChatOutput");

// Chart canvas for expenses
const expensesChartCtx = document.getElementById("expensesChart") ? document.getElementById("expensesChart").getContext("2d") : null;
let expensesChart = null;

// ---------------------------
// 5. UTILITIES
// ---------------------------
const formatCurrency = (amount = 0) => {
    const amt = Number(amount) || 0;
    return `KSh ${amt.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

const showToast = (message, isSuccess = true) => {
    if (!toastNotification) {
        console.log("Toast:", message);
        return;
    }
    toastNotification.textContent = (isSuccess ? "✅ " : "❌ ") + message;
    toastNotification.classList.add("show");
    setTimeout(() => toastNotification.classList.remove("show"), 3000);
};

const safeText = (s) => (s === undefined || s === null) ? "" : String(s);

// ---------------------------
// 6. CHARTS
// ---------------------------
const initExpensesChart = () => {
    if (!expensesChartCtx) return;
    if (expensesChart) expensesChart.destroy();

    expensesChart = new Chart(expensesChartCtx, {
        type: "bar",
        data: {
            labels: Object.keys(categoryExpenses),
            datasets: [{
                label: "Expenses (KSh)",
                data: Object.values(categoryExpenses),
                // Do not hard-code colors if you prefer; Chart.js will handle defaults.
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
};

const updateExpensesChart = () => {
    if (!expensesChart) return initExpensesChart();
    expensesChart.data.labels = Object.keys(categoryExpenses);
    expensesChart.data.datasets[0].data = Object.values(categoryExpenses);
    expensesChart.update();
};

// Trend chart
const renderTrendChart = (labels = [], incomeData = [], expenseData = []) => {
    if (!trendCanvas) return;
    const ctx = trendCanvas.getContext("2d");
    if (trendChartInstance) trendChartInstance.destroy();
    trendChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                { label: "Income", data: incomeData, fill: false, borderColor: "green" },
                { label: "Expense", data: expenseData, fill: false, borderColor: "red" }
            ]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
};

// ---------------------------
// 7. FIRESTORE: TRANSACTION STORAGE (global collection "transactions")
// ---------------------------

/**
 * Adds a transaction to global `transactions` collection.
 * tx: { userId, type, category, amount, description, date (Date or ISO string), timestamp (serverTimestamp set here) }
 */
const addTransactionGlobal = async (tx) => {
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
    } catch (error) {
        console.error("addTransactionGlobal error:", error);
        return { success: false, error };
    }
};

/**
 * Query transactions for a user with optional filters.
 * filters: { type, category, startDate (Date/string), endDate (Date/string), limit }
 * returns array of { id, ...data }
 */
const getTransactionsForUser = async (userId, filters = {}) => {
    try {
        let q = db.collection("transactions").where("userId", "==", userId);

        if (filters.type) q = q.where("type", "==", filters.type);
        if (filters.category) q = q.where("category", "==", filters.category);

        // Date filtering - compares 'date' field
        if (filters.startDate) {
            const sd = filters.startDate instanceof Date ? filters.startDate : new Date(filters.startDate);
            q = q.where("date", ">=", sd);
        }
        if (filters.endDate) {
            const ed = filters.endDate instanceof Date ? filters.endDate : new Date(filters.endDate);
            q = q.where("date", "<=", ed);
        }

        // sorting
        q = q.orderBy("date", "desc");

        if (filters.limit) q = q.limit(filters.limit);

        const snap = await q.get();
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return items;
    } catch (error) {
        console.error("getTransactionsForUser error:", error);
        return [];
    }
};

/**
 * Subscribe to user's latest transactions in real-time and update UI state.
 * We'll keep the subscription handle and detach on logout.
 */
let userTxUnsubscribe = null;

const subscribeToUserTransactions = (userId) => {
    if (userTxUnsubscribe) {
        try { userTxUnsubscribe(); } catch (e) { /* ignore */ }
        userTxUnsubscribe = null;
    }

    // Listen for user's latest 50 transactions, ordered by date desc
    const q = db.collection("transactions")
        .where("userId", "==", userId)
        .orderBy("date", "desc")
        .limit(50);

    userTxUnsubscribe = q.onSnapshot(snapshot => {
        // reset aggregates
        income = 0; expenses = 0; balance = 0;
        categoryExpenses = {};

        transactionList && (transactionList.innerHTML = "");
        allTransactionList && (allTransactionList.innerHTML = "");
        if (transactionTable) transactionTable.innerHTML = ""; // optional

        const txDocs = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            const tx = {
                id: doc.id,
                userId: d.userId,
                type: d.type,
                category: d.category,
                amount: Number(d.amount) || 0,
                description: d.description || "",
                date: d.date ? (d.date.toDate ? d.date.toDate() : new Date(d.date)) : null
            };

            txDocs.push(tx);

            // aggregate
            if (tx.type === "income") income += tx.amount;
            else { expenses += tx.amount; categoryExpenses[tx.category] = (categoryExpenses[tx.category] || 0) + tx.amount; }
        });

        // compute balance (note: this is a simple aggregate on recent txs; you might want
        // to compute lifetime balance from stored user summary saved elsewhere)
        balance = income - expenses;

        // update UI
        updateUI();

        // Render recent transactions in lists
        txDocs.slice(0, 10).forEach(tx => {
            const sign = tx.type === "income" ? "+" : "-";
            const colorClass = tx.type === "income" ? "green" : "red";
            const icon = CATEGORY_ICONS[tx.category] || CATEGORY_ICONS["Other"];
            const li = document.createElement("li");
            const dateStr = tx.date ? tx.date.toLocaleDateString() : "";
            li.innerHTML = `<span>${icon} ${safeText(tx.description)} (${tx.category}) — <small>${dateStr}</small></span>
                            <span class="${colorClass}">${sign}${formatCurrency(tx.amount)}</span>`;
            transactionList && transactionList.appendChild(li);
        });

        // Also keep a full transaction list for "All Transactions"
        txDocs.forEach(tx => {
            const sign = tx.type === "income" ? "+" : "-";
            const colorClass = tx.type === "income" ? "green" : "red";
            const icon = CATEGORY_ICONS[tx.category] || CATEGORY_ICONS["Other"];
            const li = document.createElement("li");
            li.innerHTML = `<span>${icon} ${safeText(tx.description)} (${tx.category})</span>
                            <span class="${colorClass}">${sign}${formatCurrency(tx.amount)}</span>`;
            allTransactionList && allTransactionList.appendChild(li);
        });

        // If transactionTable exists in HTML, render rows
        if (transactionTable) {
            const rows = txDocs.map(t => {
                const dateStr = t.date ? t.date.toLocaleDateString() : "";
                return `<tr>
                    <td>${dateStr}</td>
                    <td>${t.type}</td>
                    <td>${t.category}</td>
                    <td>${formatCurrency(t.amount)}</td>
                    <td>${safeText(t.description)}</td>
                </tr>`;
            }).join("");
            transactionTable.innerHTML = `<tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Note</th></tr>${rows}`;
        }

        // refresh charts
        updateExpensesChart();

    }, err => console.error("Realtime transaction listener error:", err));
};

// ---------------------------
// 8. UI / Data helpers and update
// ---------------------------
const CATEGORY_ICONS = {
    "Travel": "✈️", "Food": "🍔", "Groceries": "🛒",
    "Shopping": "🛍️", "Utilities": "💡", "Entertainment": "🍿",
    "Salary": "💰", "Investment": "📈", "Other": "🏷️"
};

const updateLimitProgressUI = () => {
    if (!limitProgressEl) return;
    const expenseTotal = expenses;
    const progressPercent = Math.min((expenseTotal / (dailyLimit || 1)) * 100, 100);
    limitProgressEl.style.width = `${progressPercent}%`;
    const limitCard = document.querySelector('.limit-card');
    if (limitCard) {
        limitCard.querySelector('p:first-of-type').textContent = `${formatCurrency(expenseTotal)} Used`;
        limitCard.querySelector('.small-text').textContent = `${(100 - progressPercent).toFixed(0)}% remaining`;
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

    // net savings
    const net = income - expenses;
    if (netSavingsEl) {
        const sign = net >= 0 ? "✅" : "⬇️";
        netSavingsEl.innerHTML = `Net Change: <span class="net-value ${net >= 0 ? 'positive' : 'negative'}">${sign} ${formatCurrency(Math.abs(net))}</span>`;
    }

    updateLimitProgressUI();
    updateExpensesChart();
};

// ---------------------------
// 9. AUTH HANDLING
// ---------------------------
const toggleAppVisibility = (loggedIn, user = null) => {
    if (loggedIn && user) {
        currentUserId = user.uid;
        currentUserName = (user.displayName || user.email.split("@")[0] || "User");
        authModal && authModal.classList && authModal.classList.remove("active-modal");
        appDashboard && (appDashboard.style.display = "flex");
        // subscribe to user's txs
        subscribeToUserTransactions(currentUserId);
    } else {
        // detach listener
        if (userTxUnsubscribe) { try { userTxUnsubscribe(); } catch (e) { } userTxUnsubscribe = null; }
        currentUserId = null;
        currentUserName = "Guest";
        authModal && authModal.classList && authModal.classList.add("active-modal");
        appDashboard && (appDashboard.style.display = "none");

        // clear UI
        balance = income = expenses = 0;
        categoryExpenses = {};
        if (transactionList) transactionList.innerHTML = "";
        if (allTransactionList) allTransactionList.innerHTML = "";
        if (transactionTable) transactionTable.innerHTML = "";
        updateUI();
        if (expensesChart) { try { expensesChart.destroy(); } catch (e) { } expensesChart = null; }
    }
};

auth.onAuthStateChanged((user) => {
    if (user) toggleAppVisibility(true, user);
    else toggleAppVisibility(false);
});

// Auth form submit (your existing logic uses auth.createUserWithEmailAndPassword / signInWithEmailAndPassword)
if (authForm) {
    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("authEmail").value;
        const password = document.getElementById("authPassword").value;
        const confirmPassword = document.getElementById("authConfirmPassword") ? document.getElementById("authConfirmPassword").value : null;

        authMessage && (authMessage.style.display = "none");
        // toggle signup mode logic (existing in your app) - we'll detect by authTitle text
        const isSignupMode = authTitle && authTitle.textContent && authTitle.textContent.toLowerCase().includes("create");

        if (isSignupMode) {
            if (password !== confirmPassword) {
                if (authMessage) { authMessage.style.display = "block"; authMessage.textContent = "Passwords do not match."; }
                return;
            }
            try {
                await auth.createUserWithEmailAndPassword(email, password);
            } catch (err) {
                if (authMessage) { authMessage.style.display = "block"; authMessage.textContent = err.message; }
            }
        } else {
            try {
                await auth.signInWithEmailAndPassword(email, password);
            } catch (err) {
                if (authMessage) { authMessage.style.display = "block"; authMessage.textContent = "Login failed: " + err.message; }
            }
        }
    });
}

// Logout button
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        logoutConfirmModal.style.display = "flex";
    });
}
if (confirmLogoutBtn) {
    confirmLogoutBtn.addEventListener("click", async () => {
        logoutConfirmModal.style.display = "none";
        try {
            await auth.signOut();
        } catch (e) {
            console.error("Logout error:", e);
        }
    });
}
if (cancelLogoutBtn) {
    cancelLogoutBtn.addEventListener("click", () => logoutConfirmModal.style.display = "none");
}

// toggle signup link handling (your existing approach)
if (toggleSignupLink) {
    toggleSignupLink.addEventListener("click", (e) => {
        e.preventDefault();
        const isSignup = authTitle && authTitle.textContent && authTitle.textContent.toLowerCase().includes("create");
        if (isSignup) {
            authTitle.textContent = "Login to Financial Dashboard";
            authSubmitBtn && (authSubmitBtn.textContent = "Login");
            confirmPasswordGroup && (confirmPasswordGroup.style.display = "none");
            toggleSignupLink.innerHTML = "Sign Up";
        } else {
            authTitle.textContent = "Create a New Account";
            authSubmitBtn && (authSubmitBtn.textContent = "Sign Up");
            confirmPasswordGroup && (confirmPasswordGroup.style.display = "block");
            toggleSignupLink.innerHTML = "Log In";
        }
    });
}

// ---------------------------
// 10. TRANSACTION FORM HANDLING
// ---------------------------
if (typeSelect) {
    typeSelect.addEventListener("change", () => {
        const isIncome = typeSelect.value === "income";
        if (saveTransactionBtn) saveTransactionBtn.textContent = isIncome ? "Record Income" : "Save Expense";
        // toggle category visibility for income categories
        if (categorySelect) {
            const options = categorySelect.querySelectorAll("option");
            options.forEach(o => {
                const optionType = o.getAttribute("data-type");
                if (isIncome && !optionType) o.style.display = "none";
                else if (!isIncome && optionType) o.style.display = "none";
                else o.style.display = "block";
            });
            // ensure default present
            if (categorySelect.selectedOptions && categorySelect.selectedOptions[0] && categorySelect.selectedOptions[0].style.display === 'none') {
                categorySelect.value = isIncome ? 'Salary' : 'Food';
            }
        }
    });
}

// open modal
if (addBtn) {
    addBtn.addEventListener("click", () => {
        if (transactionForm) transactionForm.reset();
        if (transactionModal) transactionModal.style.display = "flex";
    });
}
// close modal
if (closeModal) {
    closeModal.addEventListener("click", () => transactionModal && (transactionModal.style.display = "none"));
}

// handle transaction submit
if (transactionForm) {
    transactionForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUserId) { alert("Please log in to add transactions."); return; }

        const description = descriptionInput ? descriptionInput.value.trim() : "";
        const amount = amountInput ? parseFloat(amountInput.value) : NaN;
        const type = typeSelect ? typeSelect.value : "expense";
        const category = categorySelect ? categorySelect.value : "Other";

        if (isNaN(amount) || amount <= 0) { alert("Enter valid amount"); return; }

        const payload = {
            userId: currentUserId,
            type,
            category,
            amount,
            description,
            date: new Date()
        };

        const result = await addTransactionGlobal(payload);
        if (result.success) {
            showToast(`${formatCurrency(amount)} recorded for ${category}.`, true);
            // update local aggregates immediately for better UX:
            if (type === "income") income += amount; else { expenses += amount; categoryExpenses[category] = (categoryExpenses[category] || 0) + amount; }
            balance = income - expenses;
            updateUI();
            transactionForm.reset();
            transactionModal && (transactionModal.style.display = "none");
        } else {
            showToast("Failed to save transaction.", false);
        }
    });
}

// ---------------------------
// 11. REPORTS & FILTERING HANDLERS
// ---------------------------

/**
 * Helper: returns Date n days ago
 */
const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
};

// Default: generate last 30 days report
if (generateReportBtn) {
    generateReportBtn.addEventListener("click", async () => {
        if (!currentUserId) { alert("Please login first."); return; }
        // default: last 30 days
        const startDate = daysAgo(30);
        const endDate = new Date();
        const txs = await getTransactionsForUser(currentUserId, { startDate, endDate, limit: 1000 });

        const summary = summarizeTransactions(txs);
        const html = `
            <h4>Report (Last 30 days)</h4>
            <p>Total Income: ${formatCurrency(summary.totalIncome)}</p>
            <p>Total Expense: ${formatCurrency(summary.totalExpense)}</p>
            <p>Net: ${formatCurrency(summary.balance)}</p>
            <p>Top Categories: ${summary.topCategories.map(tc => `${tc.category} (${formatCurrency(tc.amount)})`).join(", ")}</p>
        `;
        if (reportOutput) reportOutput.innerHTML = html;
        // also update the expenses chart based on this filtered set:
        categoryExpenses = summary.byCategory;
        updateExpensesChart();
    });
}

// View Trend: use last 6 months aggregated monthly
if (viewTrendBtn) {
    viewTrendBtn.addEventListener("click", async () => {
        if (!currentUserId) { alert("Please login first."); return; }
        const months = 6;
        // fetch recent 1000 transactions (reasonable for client)
        const allTx = await getTransactionsForUser(currentUserId, { limit: 1000 });
        // group by month label YYYY-MM
        const now = new Date();
        const labels = [];
        const incomeData = [];
        const expenseData = [];

        for (let i = months - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            labels.push(`${year}-${String(month).padStart(2, "0")}`);
        }

        labels.forEach(label => {
            const [y, m] = label.split("-");
            const start = new Date(Number(y), Number(m) - 1, 1);
            const end = new Date(Number(y), Number(m), 0, 23, 59, 59, 999);
            const txsInMonth = allTx.filter(t => {
                const td = t.date instanceof Date ? t.date : (t.date && t.date.toDate ? t.date.toDate() : new Date(t.date));
                return td >= start && td <= end;
            });
            const inc = txsInMonth.filter(t => t.type === "income").reduce((s, r) => s + (r.amount || 0), 0);
            const exp = txsInMonth.filter(t => t.type === "expense").reduce((s, r) => s + (r.amount || 0), 0);
            incomeData.push(inc);
            expenseData.push(exp);
        });

        renderTrendChart(labels, incomeData, expenseData);
    });
}

// Utility: summarize transaction set
function summarizeTransactions(transactions) {
    const byCategory = {};
    let totalIncome = 0;
    let totalExpense = 0;

    transactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === "income") totalIncome += amt;
        else { totalExpense += amt; byCategory[t.category] = (byCategory[t.category] || 0) + amt; }
    });

    const balance = totalIncome - totalExpense;
    const topCategories = Object.entries(byCategory)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

    return { totalIncome, totalExpense, balance, byCategory, topCategories };
}

// ---------------------------
// 12. AI: Conversational Chat + Predictive Insights
// ---------------------------

/**
 * save chat to Firestore for persistence (optional)
 */
const saveChatToDb = async (userId, role, text) => {
    if (!SAVE_CHAT_TO_DB || !userId) return;
    try {
        await db.collection("chats").add({
            userId,
            role,
            text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error("saveChatToDb error:", e);
    }
};

/**
 * get AI response using conversation history and user's financial context
 */
const getAIFinancialAdvice = async (userQuestion) => {
    if (!gemini) return "AI coach unavailable (no Gemini init).";

    // 1) append to in-memory conversation
    conversationHistory.push({ role: "user", text: userQuestion });
    if (currentUserId && SAVE_CHAT_TO_DB) await saveChatToDb(currentUserId, "user", userQuestion);

    // 2) fetch recent transactions summary to include context (last 90 days)
    const recentTxs = await getTransactionsForUser(currentUserId, { startDate: daysAgo(90), limit: 1000 });
    const summary = summarizeTransactions(recentTxs);

    // 3) build concise context
    const financialContext = `
    Balance: ${formatCurrency(summary.balance)}
    Total Income (90d): ${formatCurrency(summary.totalIncome)}
    Total Expense (90d): ${formatCurrency(summary.totalExpense)}
    Top categories: ${summary.topCategories.map(t => `${t.category}:${Math.round(t.amount)}`).join(", ")}
    Daily Limit: ${formatCurrency(dailyLimit)}
    `;

    // 4) Build the prompt combining conversation memory and context
    // Keep memory truncated to last 8 messages to keep prompt short
    const mem = conversationHistory.slice(-8).map(m => `${m.role}: ${m.text}`).join("\n");

    const systemPrompt = `
You are FinCoach, a friendly, concise financial coach. Use the provided financial context and the user's question to give actionable, empathetic advice in <= 4 sentences. Use numbers where helpful.
Financial Context:
${financialContext}
Conversation History:
${mem}
User Question:
${userQuestion}
    `;

    try {
        // Use the SDK to call model; adapt to possible response shapes
        const modelInstance = gemini.getGenerativeModel({ model: geminiModel });
        // The SDK's method shape can vary: we'll attempt .generateContent(prompt) and handle result
        const result = await modelInstance.generateContent(systemPrompt);
        // result.response.text() or result.output_text or result.text
        let text = "";
        try {
            if (result?.response && typeof result.response.text === "function") text = await result.response.text();
            else if (result?.response && result.response.text) text = result.response.text;
            else if (result?.output_text) text = result.output_text;
            else if (result?.text) text = result.text;
            else text = JSON.stringify(result).slice(0, 800);
        } catch (e) {
            text = JSON.stringify(result).slice(0, 800);
        }

        // save assistant reply to memory and Firestore
        conversationHistory.push({ role: "assistant", text });
        if (currentUserId && SAVE_CHAT_TO_DB) await saveChatToDb(currentUserId, "assistant", text);

        return text;
    } catch (err) {
        console.error("Gemini error:", err);
        return "Sorry, I'm having trouble connecting to the AI assistant right now.";
    }
};

/**
 * Predictive insights: ask the model to forecast based on historical transactions
 */
const getPredictiveInsights = async () => {
    if (!gemini) return "Prediction engine unavailable.";

    // fetch last 6 months of transactions
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const txs = await getTransactionsForUser(currentUserId, { startDate: sixMonthsAgo, limit: 1000 });
    const summary = summarizeTransactions(txs);

    const prompt = `
You are FinCoach. Analyze this user's last 6 months transactions and give:
1) A 1-paragraph prediction of next month's expenses (high/low confidence),
2) One key risk to watch for,
3) Two actionable suggestions to improve savings.
Transactions summary: ${JSON.stringify({ summary, sample: txs.slice(0, 40) }, null, 2)}
    `;

    try {
        const modelInstance = gemini.getGenerativeModel({ model: geminiModel });
        const result = await modelInstance.generateContent(prompt);
        let text = "";
        try {
            if (result?.response && typeof result.response.text === "function") text = await result.response.text();
            else if (result?.response && result.response.text) text = result.response.text;
            else if (result?.output_text) text = result.output_text;
            else if (result?.text) text = result.text;
            else text = JSON.stringify(result).slice(0, 1000);
        } catch (e) {
            text = JSON.stringify(result).slice(0, 1000);
        }
        return text;
    } catch (e) {
        console.error("Predictive insights error:", e);
        return "Unable to produce predictive insights at this time.";
    }
};

// AI chat UI wiring
if (aiChatForm) {
    aiChatForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUserId) { showToast("Please log in to use the AI coach.", false); return; }
        const q = (aiQuestionInput && aiQuestionInput.value) ? aiQuestionInput.value.trim() : "";
        if (!q) return;
        // show user message
        appendMessage('user', q);
        if (aiQuestionInput) aiQuestionInput.value = "";

        appendMessage('ai', "Thinking...");
        // get response
        const aiReply = await getAIFinancialAdvice(q);
        // remove the "Thinking..." message (the last child)
        if (aiChatOutput && aiChatOutput.lastChild) {
            const last = aiChatOutput.lastChild;
            if (last && last.textContent && last.textContent.includes("Thinking")) aiChatOutput.removeChild(last);
        }
        appendMessage('ai', aiReply);
    });
}

// Append message to AI chat output
function appendMessage(sender, message) {
    if (!aiChatOutput) {
        console.log(`${sender}: ${message}`);
        return;
    }
    const el = document.createElement("div");
    el.classList.add("chat-message");
    el.classList.add(sender === "user" ? "user" : "ai");
    el.innerHTML = `<strong>${sender === "user" ? "You" : "Coach"}:</strong> ${message}`;
    aiChatOutput.appendChild(el);
    aiChatOutput.scrollTop = aiChatOutput.scrollHeight;
}

// ---------------------------
// 13. Helpful helper: quick summarize + UI action that triggers predictive insights
// ---------------------------
/**
 * Add a small UI trigger to request predictive insights (if not in your HTML you can trigger from console)
 */
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
                const insights = await getPredictiveInsights();
                if (reportOutput) reportOutput.innerHTML = `<h4>AI Forecast</h4><pre style="white-space:pre-wrap">${safeText(insights)}</pre>`;
            });
        }
    }
};
attachPredictButtonIfMissing();

// ---------------------------
// 14. INITIALIZATION: charts + UI readiness
// ---------------------------
initExpensesChart();
updateUI();

// ---------------------------
// 15. Small utility: export CSV (optional quick feature)
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

// Optional: attach export to report area if button present
const exportBtn = document.getElementById("exportCsvBtn");
if (exportBtn) {
    exportBtn.addEventListener("click", () => exportTransactionsToCSV({ startDate: daysAgo(365), limit: 10000 }));
}
// ====================================================================
// 🧭 SECTION NAVIGATION RESTORE PATCH
// ====================================================================

// Wait for DOM to fully load
document.addEventListener("DOMContentLoaded", () => {
    const menuItems = document.querySelectorAll(".menu li[data-section]");
    const sections = document.querySelectorAll(".content-section");

    if (menuItems.length === 0 || sections.length === 0) {
        console.warn("Navigation elements not found. Check menu selectors.");
        return;
    }

    // Handle section switching
    menuItems.forEach(item => {
        item.addEventListener("click", () => {
            // Remove active highlight from all menu items
            menuItems.forEach(i => i.classList.remove("active"));
            item.classList.add("active");

            const targetSection = item.dataset.section;

            // Hide all sections first
            sections.forEach(sec => (sec.style.display = "none"));
            document.querySelectorAll(".content-section").forEach(sec => sec.classList.remove("active-section"));

            // Show the clicked section
            const sectionEl = document.getElementById(targetSection);
            if (sectionEl) {
                sectionEl.style.display = "block";
                sectionEl.classList.add("active-section");
            } else {
                console.error(`Section ${targetSection} not found`);
            }
        });
    });

    // Optional: Dashboard default view
    const defaultSection = document.getElementById("dashboard-section");
    if (defaultSection) {
        defaultSection.style.display = "block";
        defaultSection.classList.add("active-section");
    }
});

