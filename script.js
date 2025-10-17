// ====================================================================
// 1. FIREBASE SETUP & INITIALIZATION
// ====================================================================

// Your web app's Firebase configuration - MODIFIED TO USE PLACEHOLDERS
const firebaseConfig = {
    // IMPORTANT: THESE VALUES ARE INJECTED SECURELY BY VERCEL ENVIRONMENT VARIABLES
    apiKey: "__FIREBASE_API_KEY__", // New placeholder
    authDomain: "__FIREBASE_AUTH_DOMAIN__", // New placeholder
    projectId: "__FIREBASE_PROJECT_ID__", // New placeholder
    storageBucket: "__FIREBASE_STORAGE_BUCKET__", // New placeholder
    messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__", // New placeholder
    appId: "__FIREBASE_APP_ID__", // New placeholder
    measurementId: "__FIREBASE_MEASUREMENT_ID__" // New placeholder

};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = app.auth();
const db = app.firestore();
let userRef; // Firestore reference to the user's data

// --- Currency Formatting Utility (KSh) ---
const formatCurrency = (amount) => {
    return `KSh ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

// --- Transaction Icon Mapping ---
const CATEGORY_ICONS = {
    "Travel": "✈️", "Food": "🍔", "Groceries": "🛒",
    "Shopping": "🛍️", "Utilities": "💡", "Entertainment": "🍿",
    "Salary": "💰", "Investment": "📈", "Other": "🏷️"
};

// --- Application Data State ---
let balance = 0;
let income = 0;
let expenses = 0;
let categoryExpenses = {};
let currentUserName = "Guest";
let currentUserId = null;
let dailyLimit = 10000; // Example static limit for logic demonstration

// --- DOM Elements ---
// Transaction Modal Elements
const addBtn = document.querySelector(".add-transaction");
const modal = document.getElementById("transactionModal");
const closeModal = document.getElementById("closeModal");
const form = document.getElementById("transactionForm");
const balanceEl = document.querySelector(".amount");
const incomeEl = document.querySelector(".income span");
const expensesEl = document.querySelector(".expenses span");
const transactionList = document.getElementById("transactionList");
const allTransactionList = document.getElementById("allTransactionList");
const typeSelect = document.getElementById("type");
const categorySelect = document.getElementById("category");
const saveTransactionBtn = document.getElementById("saveTransactionBtn");
const toastNotification = document.getElementById("toastNotification");
const netSavingsEl = document.getElementById("netSavingsEl");
const limitProgressEl = document.getElementById("limitProgress");

// Application Elements
const appDashboard = document.getElementById("app-dashboard");
const userNameEl = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");

// Settings Elements (NEW)
const userSettingsForm = document.getElementById("userSettingsForm");
const displayNameInput = document.getElementById("displayName");
const dailyLimitInput = document.getElementById("dailyLimitInput");

// Logout Confirmation Modal Elements
const logoutConfirmModal = document.getElementById("logoutConfirmModal");
const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");
const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");

// Auth Modal Elements
const authModal = document.getElementById("authModal");
const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const confirmPasswordGroup = document.getElementById("confirmPasswordGroup");
const authMessage = document.getElementById("authMessage");
let isSignupMode = false;

// ====================================================================
// 2. CHART SETUP & UPDATE FUNCTION
// ====================================================================

const ctx = document.getElementById("expensesChart").getContext("2d");
let expensesChart;

const createChart = () => {
    if (ctx && !expensesChart) {
        expensesChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: Object.keys(categoryExpenses),
                datasets: [{
                    label: "Expenses (KSh)",
                    data: Object.values(categoryExpenses),
                    backgroundColor: "#2563eb"
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { color: "#fff" } },
                    x: { ticks: { color: "#fff" } }
                }
            }
        });
    } else if (expensesChart) {
        updateChartData();
    }
};

const updateChartData = () => {
    if (expensesChart) {
        expensesChart.data.labels = Object.keys(categoryExpenses);
        expensesChart.data.datasets[0].data = Object.values(categoryExpenses);
        expensesChart.update();
    }
};

// ====================================================================
// 3. UI/UX HELPERS
// ====================================================================

/**
 * Shows a toast notification message.
 */
const showToast = (message, isSuccess = true) => {
    toastNotification.textContent = isSuccess ? `✅ ${message}` : `❌ ${message}`;
    toastNotification.style.backgroundColor = isSuccess ? 'var(--green-color)' : 'var(--red-color)';
    toastNotification.classList.add('show');
    setTimeout(() => {
        toastNotification.classList.remove('show');
    }, 3000);
};

/**
 * Updates the daily limit progress bar style.
 */
const updateLimitProgressUI = () => {
    const expenseTotal = expenses; // In a real app, this would be daily expenses
    const progressPercent = Math.min((expenseTotal / dailyLimit) * 100, 100);

    limitProgressEl.style.width = `${progressPercent}%`;

    // Visual Feedback: Red warning if over 80%
    if (progressPercent > 80) {
        limitProgressEl.classList.add('warning');
    } else {
        limitProgressEl.classList.remove('warning');
    }

    // Update the text elements in the card
    const limitCard = document.querySelector('.limit-card');
    // Ensure the element exists before trying to update its content
    if (limitCard) {
        const remainingPercent = (100 - progressPercent).toFixed(0);
        limitCard.querySelector('p:first-of-type').textContent = formatCurrency(expenseTotal) + " Used";
        limitCard.querySelector('.small-text').textContent = `${remainingPercent}% remaining`;
    }
};


/**
 * Renders the state data to the UI.
 */
const updateUI = () => {
    // 1. Primary Stats (KSh)
    balanceEl.textContent = formatCurrency(balance);
    incomeEl.textContent = `+${formatCurrency(income)}`;
    expensesEl.textContent = `-${formatCurrency(expenses)}`;
    userNameEl.textContent = currentUserName;

    // Update settings form fields if they are currently active
    if (displayNameInput) displayNameInput.value = currentUserName;
    if (dailyLimitInput) dailyLimitInput.value = dailyLimit;


    // 2. Net Savings Calculation and Display
    const netSavings = income - expenses;

    // Ensure the parent element exists before trying to manipulate children
    if (netSavingsEl) {
        const sign = netSavings >= 0 ? '✅' : '⬇️';
        const colorClass = netSavings >= 0 ? 'positive' : 'negative';

        netSavingsEl.innerHTML = `
            Net Change: 
            <span class="net-value ${colorClass}">
                ${sign} ${formatCurrency(Math.abs(netSavings))}
            </span>
        `;
    }

    // 3. Limit Progress UI
    updateLimitProgressUI();

    // 4. Chart Update
    updateChartData();
};

// ====================================================================
// 4. DATA HANDLING (FIRESTORE)
// ====================================================================

/**
 * Saves the current state of the user's finance summary to Firestore.
 */
const saveSummary = async () => {
    if (!userRef) return;
    try {
        // Save core summary data, and settings data
        await userRef.set({
            balance,
            income,
            expenses,
            categoryExpenses,
            displayName: currentUserName, // Save current user settings
            dailyLimit: dailyLimit,       // Save current user settings
        }, { merge: true });
    } catch (error) {
        console.error("Error saving summary:", error);
    }
};

/**
 * Loads the user's summary and transactions from Firestore.
 */
const loadUserData = async (userId) => {
    currentUserId = userId;
    userRef = db.collection('users').doc(userId);

    // 1. Load Summary & Settings
    const doc = await userRef.get();
    if (doc.exists && doc.data().balance !== undefined) {
        const data = doc.data();
        balance = data.balance || 0;
        income = data.income || 0;
        expenses = data.expenses || 0;
        categoryExpenses = data.categoryExpenses || {};

        // Load User Settings
        currentUserName = data.displayName || auth.currentUser.email.split('@')[0];
        dailyLimit = data.dailyLimit || 10000;

    } else {
        // Initialize new user data if it doesn't exist
        balance = 0;
        income = 0;
        expenses = 0;
        categoryExpenses = {
            "Travel": 0, "Food": 0, "Groceries": 0, "Shopping": 0,
            "Utilities": 0, "Entertainment": 0, "Other": 0
        };
        currentUserName = auth.currentUser.email.split('@')[0];
        dailyLimit = 10000;
        await saveSummary();
    }

    // Initialize chart
    createChart();

    // 2. Load Transactions and set up real-time listener
    userRef.collection('transactions').orderBy('timestamp', 'desc').limit(10).onSnapshot(snapshot => {
        transactionList.innerHTML = '';
        allTransactionList.innerHTML = '';

        snapshot.forEach(doc => {
            const tx = doc.data();
            const sign = tx.type === 'income' ? '+' : '-';
            const colorClass = tx.type === 'income' ? 'green' : 'red';

            // Get icon based on category
            const icon = CATEGORY_ICONS[tx.category] || CATEGORY_ICONS["Other"];

            const li = document.createElement("li");
            li.innerHTML = `
                <span>${icon} ${tx.description} (${tx.category})</span>
                <span class="${colorClass}">
                    ${sign}${formatCurrency(tx.amount)}
                </span>
            `;
            transactionList.appendChild(li);
        });

        allTransactionList.innerHTML = transactionList.innerHTML;

    }, error => console.error("Error loading transactions:", error));

    updateUI();
};

/**
 * Adds a new transaction to Firestore.
 */
const addTransactionToDb = async (tx) => {
    if (!userRef) return;
    try {
        await userRef.collection('transactions').add(tx);
    } catch (error) {
        console.error("Error adding transaction:", error);
    }
};


// ====================================================================
// 5. AUTHENTICATION LOGIC & LISTENERS
// ====================================================================

// ... (toggleAppVisibility, auth.onAuthStateChanged, auth modal logic, logout logic remains the same)

/**
 * Toggles the visibility of the main app vs. the auth modal.
 */
const toggleAppVisibility = (loggedInStatus, user = null) => {
    if (loggedInStatus) {
        currentUserName = user.email.split('@')[0];
        authModal.classList.remove("active-modal");
        appDashboard.style.display = "flex";
        loadUserData(user.uid);
    } else {
        currentUserId = null;
        userRef = null;
        appDashboard.style.display = "none";
        authModal.classList.add("active-modal");
        authForm.reset();
        authMessage.style.display = "none";

        // Clear UI data on logout
        balance = income = expenses = 0;
        categoryExpenses = {};
        transactionList.innerHTML = '';
        allTransactionList.innerHTML = '';
        updateUI();

        if (expensesChart) {
            expensesChart.destroy();
            expensesChart = null;
        }
    }
};

/**
 * Firebase Auth State Observer
 */
auth.onAuthStateChanged((user) => {
    if (user) {
        toggleAppVisibility(true, user);
    } else {
        toggleAppVisibility(false);
    }
});


// Initial attachment for auth mode toggle
document.getElementById("toggleSignup").addEventListener("click", (e) => {
    e.preventDefault();
    const link = document.getElementById("toggleSignup");
    isSignupMode = !isSignupMode;
    authMessage.style.display = "none";

    if (isSignupMode) {
        authTitle.textContent = "Create a New Account";
        authSubmitBtn.textContent = "Sign Up";
        confirmPasswordGroup.style.display = "block";
        link.parentElement.innerHTML = `Already have an account? <a href="#" id="toggleSignup">Log In</a>`;
    } else {
        authTitle.textContent = "Login to Financial Dashboard";
        authSubmitBtn.textContent = "Login";
        confirmPasswordGroup.style.display = "none";
        link.parentElement.innerHTML = `Don't have an account? <a href="#" id="toggleSignup">Sign Up</a>`;
    }
    document.getElementById("toggleSignup").addEventListener("click", arguments.callee); // Reattach
});


// Handle Logout Button Click (Show confirmation modal)
logoutBtn.addEventListener("click", () => {
    logoutConfirmModal.style.display = "flex";
});

// Handle Logout Confirmation 
confirmLogoutBtn.addEventListener("click", async () => {
    logoutConfirmModal.style.display = "none";
    try {
        await auth.signOut();
    } catch (error) {
        console.error("Logout Error:", error);
    }
});

// Handle Logout Cancellation 
cancelLogoutBtn.addEventListener("click", () => {
    logoutConfirmModal.style.display = "none";
});


// Auth Form Submission
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    const confirmPassword = document.getElementById("authConfirmPassword").value;

    authMessage.textContent = "";
    authMessage.style.display = "none";

    if (isSignupMode) {
        if (password !== confirmPassword) {
            authMessage.textContent = "Passwords do not match.";
            authMessage.style.display = "block";
            return;
        }
        try {
            await auth.createUserWithEmailAndPassword(email, password);
        } catch (error) {
            authMessage.textContent = error.message;
            authMessage.style.display = "block";
        }
    } else {
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            authMessage.textContent = "Login failed: " + error.message;
            authMessage.style.display = "block";
        }
    }
});


// ====================================================================
// 6. TRANSACTION, SETTINGS & NAVIGATION EVENT LISTENERS
// ====================================================================

// Context-Aware Button/Category Toggle
const updateTransactionFormUI = () => {
    const isIncome = typeSelect.value === 'income';

    // 1. Update Save Button Text (Context-Aware)
    saveTransactionBtn.textContent = isIncome ? 'Record Income' : 'Save Expense';

    // 2. Adjust Category Options
    const allOptions = categorySelect.querySelectorAll('option');
    allOptions.forEach(option => {
        const optionType = option.getAttribute('data-type');
        if (isIncome && !optionType) {
            option.style.display = 'none';
        } else if (!isIncome && optionType) {
            option.style.display = 'none';
        } else {
            option.style.display = 'block';
        }
    });

    // Ensure a valid default is selected if the current one is hidden
    if (categorySelect.selectedOptions[0].style.display === 'none') {
        categorySelect.value = isIncome ? 'Salary' : 'Food';
    }
};

typeSelect.addEventListener('change', updateTransactionFormUI);
updateTransactionFormUI();


// Open modal
addBtn.addEventListener("click", () => {
    form.reset();
    updateTransactionFormUI(); // Reset UI state on open
    modal.style.display = "flex";
});

// Close modal
closeModal.addEventListener("click", () => {
    modal.style.display = "none";
});

// Navigation between sections (Logic remains the same and is correct)
const menuItems = document.querySelectorAll(".menu li");
const sections = document.querySelectorAll(".content-section");

menuItems.forEach(item => {
    item.addEventListener("click", () => {
        if (item.id === "logoutBtn" || !item.getAttribute("data-section")) return;

        menuItems.forEach(i => i.classList.remove("active"));
        sections.forEach(sec => sec.classList.remove("active-section"));

        item.classList.add("active");
        const sectionId = item.getAttribute("data-section");
        document.getElementById(sectionId).classList.add("active-section");
    });
});

// Settings Form Submission Listener (NEW FUNCTIONALITY)
if (userSettingsForm) {
    userSettingsForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const newDisplayName = displayNameInput.value.trim();
        const newDailyLimit = parseFloat(dailyLimitInput.value);

        let settingsChanged = false;

        // Update Display Name
        if (newDisplayName && currentUserName !== newDisplayName) {
            currentUserName = newDisplayName;
            userNameEl.textContent = currentUserName;
            settingsChanged = true;
        }

        // Update Daily Limit
        if (!isNaN(newDailyLimit) && newDailyLimit > 0 && dailyLimit !== newDailyLimit) {
            dailyLimit = newDailyLimit;
            updateLimitProgressUI();
            settingsChanged = true;
        }

        // Save to DB and provide feedback
        if (settingsChanged) {
            await saveSummary(); // Saves displayName and dailyLimit
            showToast("Settings updated successfully!", true);
        } else {
            showToast("No changes detected.", false);
        }
    });
}


// Handle transaction form
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const description = document.getElementById("description").value;
    const amount = parseFloat(document.getElementById("amount").value);
    const type = document.getElementById("type").value;
    const category = document.getElementById("category").value;

    if (isNaN(amount) || amount <= 0) {
        alert("Enter a valid amount");
        return;
    }

    const txAmount = amount;

    // Update local state 
    if (type === "income") {
        income += txAmount;
        balance += txAmount;
    } else {
        expenses += txAmount;
        balance -= txAmount;
        categoryExpenses[category] = (categoryExpenses[category] || 0) + txAmount;
    }

    await saveSummary();

    const newTransaction = {
        description,
        amount: txAmount,
        type,
        category,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    await addTransactionToDb(newTransaction);

    updateUI();

    // Show toast notification
    showToast(`${formatCurrency(txAmount)} recorded for ${category}.`);

    // Reset & close modal
    form.reset();
    modal.style.display = "none";
});