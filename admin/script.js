let authToken = localStorage.getItem('adminToken');

// Check if already logged in
document.addEventListener('DOMContentLoaded', function() {
    if (authToken) {
        showDashboard();
        loadStats();
        loadUsers();
    } else {
        showLogin();
    }
});

// Login functionality
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const response = await fetch('/api/v1/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('adminToken', authToken);
            showDashboard();
            loadStats();
            loadUsers();
            errorDiv.textContent = '';
        } else {
            errorDiv.textContent = data.message;
        }
    } catch (error) {
        errorDiv.textContent = 'Login failed. Please try again.';
    }
});

function showLogin() {
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('dashboardContainer').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('dashboardContainer').style.display = 'block';
}

function logout() {
    localStorage.removeItem('adminToken');
    authToken = null;
    showLogin();
}

function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    
    // Show selected section
    document.getElementById(sectionName).classList.add('active');
    event.target.classList.add('active');
    
    // Load data based on section
    switch(sectionName) {
        case 'users':
            loadUsers();
            break;
        case 'users-by-date':
            // Don't auto-load, let user select date
            document.getElementById('usersByDateContent').innerHTML = '<p>Select a date to view users who signed up on that date.</p>';
            break;
        case 'transactions':
            loadTransactions();
            break;
        case 'payments':
            loadPayments();
            break;
        case 'creator-passes':
            loadCreatorPasses();
            break;
        case 'overview':
            loadFinancialOverview();
            break;
        case 'auto-nsfw':
            loadAutoNSFWViolations();
            break;
        case 'auto-copyright':
            loadAutoCopyrightViolations();
            break;
        case 'moderation-stats':
            loadContentModerationStats();
            break;
    }
}

async function makeAuthenticatedRequest(url) {
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });
    
    if (response.status === 401) {
        logout();
        throw new Error('Authentication failed');
    }
    
    return response;
}

async function loadStats() {
    try {
        const response = await makeAuthenticatedRequest('/api/v1/admin/stats');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('totalUsers').textContent = data.stats.totalUsers;
            document.getElementById('totalTransactions').textContent = data.stats.totalTransactions;
            document.getElementById('totalRevenue').textContent = data.stats.totalRevenue.toLocaleString();
            document.getElementById('totalVideos').textContent = data.stats.totalVideos;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadUsers() {
    try {
        document.getElementById('usersContent').innerHTML = '<div class="loading">Loading users...</div>';
        const response = await makeAuthenticatedRequest('/api/v1/admin/users');
        const data = await response.json();
        
        if (data.success) {
            renderUsersTable(data.users, 'usersContent');
        }
    } catch (error) {
        document.getElementById('usersContent').innerHTML = '<div class="error">Error loading users</div>';
    }
}

async function loadUsersByDate(date = '') {
    try {
        document.getElementById('usersByDateContent').innerHTML = '<div class="loading">Loading users...</div>';
        
        let url = '/api/v1/admin/users-by-date';
        if (date) {
            url += `?date=${date}`;
        }
        
        const response = await makeAuthenticatedRequest(url);
        const data = await response.json();
        
        if (data.success) {
            renderUsersTable(data.users, 'usersByDateContent');
            
            // Show count message
            const countMsg = date 
                ? `Found ${data.users.length} users who signed up on ${date}`
                : `Showing ${data.users.length} users`;
            
            const container = document.getElementById('usersByDateContent');
            container.insertAdjacentHTML('afterbegin', `<div class="info-message">${countMsg}</div>`);
        }
    } catch (error) {
        document.getElementById('usersByDateContent').innerHTML = '<div class="error">Error loading users</div>';
    }
}

async function searchUsersByDate() {
    const date = document.getElementById('userSignupDate').value;
    if (!date) {
        alert('Please select a date');
        return;
    }
    await loadUsersByDate(date);
}

function renderUsersTable(users, containerId) {
    if (!users || users.length === 0) {
        document.getElementById(containerId).innerHTML = '<p>No users found.</p>';
        return;
    }

    let html = '<table class="data-table"><thead><tr>';
    html += '<th>Username</th><th>Email</th><th>Verified</th><th>Followers</th><th>Videos</th><th>Communities</th><th>Joined</th><th>Status</th>';
    html += '</tr></thead><tbody>';

    users.forEach(user => {
        html += '<tr>';
        html += `<td>${user.username || 'N/A'}</td>`;
        html += `<td>${user.email || 'N/A'}</td>`;
        html += `<td>${user.email_verification?.is_verified ? '✅' : '❌'}</td>`;
        html += `<td>${user.followers?.length || 0}</td>`;
        html += `<td>${user.videoCount || 0}</td>`;
        html += `<td>${user.my_communities?.length || 0}</td>`;
        html += `<td>${new Date(user.createdAt).toLocaleDateString()}</td>`;
        html += `<td><span class="status ${user.account_status?.is_deactivated ? 'inactive' : 'active'}">`;
        html += `${user.account_status?.is_deactivated ? 'Deactivated' : 'Active'}</span></td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    document.getElementById(containerId).innerHTML = html;
}

async function loadTransactions() {
    try {
        document.getElementById('transactionsContent').innerHTML = '<div class="loading">Loading transactions...</div>';
        const response = await makeAuthenticatedRequest('/api/v1/admin/transactions');
        const data = await response.json();
        
        if (data.success) {
            renderTransactionsTable(data.transactions);
        }
    } catch (error) {
        document.getElementById('transactionsContent').innerHTML = '<div class="error">Error loading transactions</div>';
    }
}

async function searchTransactionsByDate() {
    const date = document.getElementById('transactionDate').value;
    if (!date) {
        alert('Please select a date');
        return;
    }
    
    try {
        document.getElementById('transactionsContent').innerHTML = '<div class="loading">Loading transactions...</div>';
        const response = await makeAuthenticatedRequest(`/api/v1/admin/transactions?date=${date}`);
        const data = await response.json();
        
        if (data.success) {
            renderTransactionsTable(data.transactions);
        }
    } catch (error) {
        document.getElementById('transactionsContent').innerHTML = '<div class="error">Error loading transactions</div>';
    }
}

function renderTransactionsTable(transactions) {
    if (!transactions || transactions.length === 0) {
        document.getElementById('transactionsContent').innerHTML = '<p>No transactions found.</p>';
        return;
    }

    let html = '<table class="data-table"><thead><tr>';
    html += '<th>Type</th><th>User</th><th>Amount</th><th>Category</th><th>Status</th><th>Date</th><th>Description</th>';
    html += '</tr></thead><tbody>';

    transactions.forEach(txn => {
        html += '<tr>';
        html += `<td>${txn.transaction_type || 'N/A'}</td>`;
        html += `<td>${txn.user_id?.username || 'N/A'}</td>`;
        html += `<td class="amount">₹${txn.amount || 0}</td>`;
        html += `<td>${txn.transaction_category || 'N/A'}</td>`;
        html += `<td><span class="status ${txn.status || 'pending'}">${txn.status || 'pending'}</span></td>`;
        html += `<td>${new Date(txn.createdAt).toLocaleString()}</td>`;
        html += `<td>${txn.description || 'N/A'}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    document.getElementById('transactionsContent').innerHTML = html;
}

async function loadPayments() {
    try {
        document.getElementById('paymentsContent').innerHTML = '<div class="loading">Loading payments...</div>';
        const response = await makeAuthenticatedRequest('/api/v1/admin/payments');
        const data = await response.json();
        
        if (data.success) {
            renderPaymentsTable(data.payments);
        }
    } catch (error) {
        document.getElementById('paymentsContent').innerHTML = '<div class="error">Error loading payments</div>';
    }
}

async function searchPaymentsByDate() {
    const date = document.getElementById('paymentDate').value;
    if (!date) {
        alert('Please select a date');
        return;
    }
    
    try {
        document.getElementById('paymentsContent').innerHTML = '<div class="loading">Loading payments...</div>';
        const response = await makeAuthenticatedRequest(`/api/v1/admin/payments?date=${date}`);
        const data = await response.json();
        
        if (data.success) {
            renderPaymentsTable(data.payments);
        }
    } catch (error) {
        document.getElementById('paymentsContent').innerHTML = '<div class="error">Error loading payments</div>';
    }
}

function renderPaymentsTable(payments) {
    if (!payments || payments.length === 0) {
        document.getElementById('paymentsContent').innerHTML = '<p>No payments found.</p>';
        return;
    }

    let html = '<table class="data-table"><thead><tr>';
    html += '<th>From</th><th>To</th><th>Amount</th><th>Type</th><th>Status</th><th>Date</th>';
    html += '</tr></thead><tbody>';

    payments.forEach(payment => {
        html += '<tr>';
        html += `<td>${payment.paid_by?.username || 'N/A'}</td>`;
        html += `<td>${payment.paid_to?.username || 'N/A'}</td>`;
        html += `<td class="amount">₹${payment.amount || 0}</td>`;
        html += `<td>${payment.payment_type || 'N/A'}</td>`;
        html += `<td><span class="status ${payment.status || 'pending'}">${payment.status || 'pending'}</span></td>`;
        html += `<td>${new Date(payment.createdAt).toLocaleString()}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    document.getElementById('paymentsContent').innerHTML = html;
}

async function loadCreatorPasses() {
    try {
        document.getElementById('creatorPassesContent').innerHTML = '<div class="loading">Loading creator passes...</div>';
        const response = await makeAuthenticatedRequest('/api/v1/admin/creator-passes');
        const data = await response.json();
        
        if (data.success) {
            renderCreatorPassesTable(data.creatorPasses);
        }
    } catch (error) {
        document.getElementById('creatorPassesContent').innerHTML = '<div class="error">Error loading creator passes</div>';
    }
}

function renderCreatorPassesTable(passes) {
    if (!passes || passes.length === 0) {
        document.getElementById('creatorPassesContent').innerHTML = '<p>No creator passes found.</p>';
        return;
    }

    let html = '<table class="data-table"><thead><tr>';
    html += '<th>User</th><th>Creator</th><th>Amount</th><th>Status</th><th>Start Date</th><th>End Date</th><th>Method</th>';
    html += '</tr></thead><tbody>';

    passes.forEach(pass => {
        html += '<tr>';
        html += `<td>${pass.user_id?.username || 'N/A'}</td>`;
        html += `<td>${pass.creator_id?.username || 'N/A'}</td>`;
        html += `<td class="amount">₹${pass.amount_paid || 0}</td>`;
        html += `<td><span class="status ${pass.status || 'pending'}">${pass.status || 'pending'}</span></td>`;
        html += `<td>${new Date(pass.start_date).toLocaleDateString()}</td>`;
        html += `<td>${new Date(pass.end_date).toLocaleDateString()}</td>`;
        html += `<td>${pass.purchase_method || 'wallet'}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    document.getElementById('creatorPassesContent').innerHTML = html;
}

async function loadFinancialOverview(timeframe = 'all') {
    try {
        document.getElementById('financialOverviewContent').innerHTML = '<div class="loading">Loading financial overview...</div>';
        const response = await makeAuthenticatedRequest(`/api/v1/admin/financial-overview?timeframe=${timeframe}`);
        const data = await response.json();
        
        if (data.success) {
            renderFinancialOverview(data.financialData, data.timeframe);
        }
    } catch (error) {
        document.getElementById('financialOverviewContent').innerHTML = '<div class="error">Error loading financial overview</div>';
    }
}

function renderFinancialOverview(financialData, timeframe) {
    const formatCurrency = (amount) => `₹${amount.toLocaleString()}`;
    
    let html = `
        <div class="financial-overview">
            <div class="overview-header">
                <h3>Financial Overview ${timeframe !== 'all' ? `(${timeframe})` : '(All Time)'}</h3>
                <div class="timeframe-selector">
                    <select onchange="loadFinancialOverview(this.value)">
                        <option value="all" ${timeframe === 'all' ? 'selected' : ''}>All Time</option>
                        <option value="7d" ${timeframe === '7d' ? 'selected' : ''}>Last 7 Days</option>
                        <option value="30d" ${timeframe === '30d' ? 'selected' : ''}>Last 30 Days</option>
                        <option value="90d" ${timeframe === '90d' ? 'selected' : ''}>Last 90 Days</option>
                        <option value="1y" ${timeframe === '1y' ? 'selected' : ''}>Last Year</option>
                    </select>
                </div>
            </div>
            
            <div class="financial-grid">
                <div class="financial-card">
                    <h4>💝 Gifting Activity</h4>
                    <div class="metric-row">
                        <span>Video Gifts:</span>
                        <span>${formatCurrency(financialData.gifting.videoGifting.amount)} (${financialData.gifting.videoGifting.count})</span>
                    </div>
                    <div class="metric-row">
                        <span>Comment Gifts:</span>
                        <span>${formatCurrency(financialData.gifting.commentGifting.amount)} (${financialData.gifting.commentGifting.count})</span>
                    </div>
                    <div class="metric-total">
                        <strong>Total Gifting: ${formatCurrency(financialData.gifting.totalGifting)}</strong>
                    </div>
                </div>

                <div class="financial-card">
                    <h4>💰 Monetization</h4>
                    <div class="metric-row">
                        <span>Content Sales:</span>
                        <span>${formatCurrency(financialData.monetization.contentSales.amount)} (${financialData.monetization.contentSales.count})</span>
                    </div>
                    <div class="metric-row">
                        <span>Creator Passes:</span>
                        <span>${formatCurrency(financialData.monetization.creatorPasses.amount)} (${financialData.monetization.creatorPasses.count})</span>
                    </div>
                    <div class="metric-row">
                        <span>Community Fees:</span>
                        <span>${formatCurrency(financialData.monetization.communityFees.amount)} (${financialData.monetization.communityFees.count})</span>
                    </div>
                    <div class="metric-total">
                        <strong>Total Monetization: ${formatCurrency(financialData.monetization.totalMonetization)}</strong>
                    </div>
                </div>

                <div class="financial-card">
                    <h4>🏦 Withdrawals</h4>
                    <div class="metric-row">
                        <span>Pending Requests:</span>
                        <span>${formatCurrency(financialData.withdrawals.pendingRequests.amount)} (${financialData.withdrawals.pendingRequests.count})</span>
                    </div>
                    <div class="metric-row">
                        <span>Total Requested:</span>
                        <span>${formatCurrency(financialData.withdrawals.completedWithdrawals.totalRequested || financialData.withdrawals.completedWithdrawals.amount)} (${financialData.withdrawals.completedWithdrawals.count})</span>
                    </div>
                    <div class="metric-row">
                        <span>Sent to Creators:</span>
                        <span>${formatCurrency(financialData.withdrawals.completedWithdrawals.amount)} (after fees)</span>
                    </div>
                    <div class="metric-row">
                        <span>Platform Fees:</span>
                        <span>${formatCurrency(financialData.withdrawals.completedWithdrawals.platformFees || 0)}</span>
                    </div>
                </div>

                <div class="financial-card">
                    <h4>💳 Wallet Activity</h4>
                    <div class="metric-row">
                        <span>Total Loaded:</span>
                        <span>${formatCurrency(financialData.walletActivity.totalLoaded.amount)} (${financialData.walletActivity.totalLoaded.count})</span>
                    </div>
                </div>
            </div>

            <div class="platform-metrics">
                <h4>📊 Platform Metrics</h4>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <span class="metric-label">Total Revenue:</span>
                        <span class="metric-value">${formatCurrency(financialData.platformMetrics.totalRevenue)}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Money Out (to creators):</span>
                        <span class="metric-value">${formatCurrency(financialData.platformMetrics.totalMoneyOut || financialData.withdrawals.completedWithdrawals.amount)}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Platform Fees Collected:</span>
                        <span class="metric-value">${formatCurrency(financialData.platformMetrics.totalPlatformFees || 0)}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Withdrawal Rate:</span>
                        <span class="metric-value">${financialData.platformMetrics.withdrawalRate}%</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Net Platform Balance:</span>
                        <span class="metric-value">${formatCurrency(financialData.platformMetrics.netPlatformBalance)}</span>
                    </div>
                </div>
                
                <div class="avg-transaction-values">
                    <h5>Average Transaction Values:</h5>
                    <div class="avg-metrics">
                        <span>Gifting: ${formatCurrency(financialData.platformMetrics.avgTransactionValue.gifting)}</span>
                        <span>Content Sales: ${formatCurrency(financialData.platformMetrics.avgTransactionValue.contentSales)}</span>
                        <span>Creator Passes: ${formatCurrency(financialData.platformMetrics.avgTransactionValue.creatorPasses)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('financialOverviewContent').innerHTML = html;
}

async function searchUsers() {
    const search = document.getElementById('usersSearch').value;
    try {
        document.getElementById('usersContent').innerHTML = '<div class="loading">Searching users...</div>';
        const response = await makeAuthenticatedRequest(`/api/v1/admin/users?search=${encodeURIComponent(search)}`);
        const data = await response.json();
        
        if (data.success) {
            renderUsersTable(data.users, 'usersContent');
        }
    } catch (error) {
        document.getElementById('usersContent').innerHTML = '<div class="error">Error searching users</div>';
    }
}

async function searchCreatorPasses() {
    const search = document.getElementById('creatorPassSearch').value;
    try {
        document.getElementById('creatorPassesContent').innerHTML = '<div class="loading">Searching creator passes...</div>';
        const response = await makeAuthenticatedRequest(`/api/v1/admin/creator-passes?search=${encodeURIComponent(search)}`);
        const data = await response.json();
        
        if (data.success) {
            renderCreatorPassesTable(data.creatorPasses);
        }
    } catch (error) {
        document.getElementById('creatorPassesContent').innerHTML = '<div class="error">Error searching creator passes</div>';
    }
}

async function loadAutoNSFWViolations(page = 1) {
    try {
        document.getElementById('autoNSFWContent').innerHTML = '<div class="loading">Loading NSFW violations...</div>';
        const response = await makeAuthenticatedRequest(`/api/v1/admin/auto-nsfw-violations?page=${page}&limit=20`);
        const data = await response.json();
        
        if (data.success) {
            renderAutoNSFWTable(data.violations, data.pagination, data.statistics);
        }
    } catch (error) {
        document.getElementById('autoNSFWContent').innerHTML = '<div class="error">Error loading NSFW violations</div>';
    }
}

async function loadAutoCopyrightViolations(page = 1) {
    try {
        document.getElementById('autoCopyrightContent').innerHTML = '<div class="loading">Loading copyright violations...</div>';
        const response = await makeAuthenticatedRequest(`/api/v1/admin/auto-copyright-violations?page=${page}&limit=20`);
        const data = await response.json();
        
        if (data.success) {
            renderAutoCopyrightTable(data.violations, data.pagination, data.statistics);
        }
    } catch (error) {
        document.getElementById('autoCopyrightContent').innerHTML = '<div class="error">Error loading copyright violations</div>';
    }
}

async function loadContentModerationStats() {
    try {
        document.getElementById('moderationStatsContent').innerHTML = '<div class="loading">Loading moderation statistics...</div>';
        const response = await makeAuthenticatedRequest('/api/v1/admin/content-moderation-stats?timeframe=30d');
        const data = await response.json();
        
        if (data.success) {
            renderModerationStats(data.statistics, data.timeframe);
        }
    } catch (error) {
        document.getElementById('moderationStatsContent').innerHTML = '<div class="error">Error loading moderation stats</div>';
    }
}

function renderAutoNSFWTable(violations, pagination, statistics) {
    if (!violations || violations.length === 0) {
        document.getElementById('autoNSFWContent').innerHTML = '<p>No NSFW violations found.</p>';
        return;
    }

    let html = `
        <div class="moderation-header">
            <h3>Auto NSFW Violations (${statistics.totalViolations} total)</h3>
        </div>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Video</th>
                    <th>Owner</th>
                    <th>Views</th>
                    <th>Detected At</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    violations.forEach(violation => {
        html += '<tr>';
        html += `<td>
            <div class="video-info">
                <img src="${violation.video.thumbnailUrl || '/placeholder.jpg'}" alt="Thumbnail" style="width: 60px; height: 40px; object-fit: cover;">
                <div>
                    <div class="video-title">${violation.video.name}</div>
                    <div class="video-id">ID: ${violation.video.id}</div>
                </div>
            </div>
        </td>`;
        html += `<td>
            <div class="user-info">
                <img src="${violation.owner.profilePhoto || '/default-avatar.png'}" alt="Avatar" style="width: 30px; height: 30px; border-radius: 50%;">
                <div>
                    <div>${violation.owner.username}</div>
                    <div class="user-email">${violation.owner.email}</div>
                </div>
            </div>
        </td>`;
        html += `<td>${violation.video.views}</td>`;
        html += `<td>${new Date(violation.detectedAt).toLocaleString()}</td>`;
        html += `<td>
            <button onclick="viewVideoDetails('${violation.video.id}')" class="btn-small">View</button>
            <button onclick="viewUserViolations('${violation.owner.id}')" class="btn-small">User History</button>
        </td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    
    // Add pagination
    if (pagination.pages > 1) {
        html += `<div class="pagination">
            ${pagination.page > 1 ? `<button onclick="loadAutoNSFWViolations(${pagination.page - 1})">Previous</button>` : ''}
            <span>Page ${pagination.page} of ${pagination.pages}</span>
            ${pagination.page < pagination.pages ? `<button onclick="loadAutoNSFWViolations(${pagination.page + 1})">Next</button>` : ''}
        </div>`;
    }

    document.getElementById('autoNSFWContent').innerHTML = html;
}

function renderAutoCopyrightTable(violations, pagination, statistics) {
    if (!violations || violations.length === 0) {
        document.getElementById('autoCopyrightContent').innerHTML = '<p>No copyright violations found.</p>';
        return;
    }

    let html = `
        <div class="moderation-header">
            <h3>Auto Copyright Violations (${statistics.totalViolations} total)</h3>
        </div>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Flagged Video</th>
                    <th>Owner</th>
                    <th>Matched Video</th>
                    <th>Type</th>
                    <th>Detected At</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    violations.forEach(violation => {
        html += '<tr>';
        html += `<td>
            <div class="video-info">
                <img src="${violation.flaggedVideo.thumbnailUrl || '/placeholder.jpg'}" alt="Thumbnail" style="width: 60px; height: 40px; object-fit: cover;">
                <div>
                    <div class="video-title">${violation.flaggedVideo.name}</div>
                    <div class="video-views">${violation.flaggedVideo.views} views</div>
                </div>
            </div>
        </td>`;
        html += `<td>
            <div class="user-info">
                <img src="${violation.flaggedVideoOwner.profilePhoto || '/default-avatar.png'}" alt="Avatar" style="width: 30px; height: 30px; border-radius: 50%;">
                <div>
                    <div>${violation.flaggedVideoOwner.username}</div>
                </div>
            </div>
        </td>`;
        html += `<td>
            <div class="video-info">
                <img src="${violation.matchedVideo.thumbnailUrl || '/placeholder.jpg'}" alt="Thumbnail" style="width: 60px; height: 40px; object-fit: cover;">
                <div>
                    <div class="video-title">${violation.matchedVideo.name}</div>
                    <div class="video-views">${violation.matchedVideo.views} views</div>
                </div>
            </div>
        </td>`;
        html += `<td><span class="fingerprint-type ${violation.fingerprintType}">${violation.fingerprintType}</span></td>`;
        html += `<td>${new Date(violation.detectedAt).toLocaleString()}</td>`;
        html += `<td>
            <button onclick="compareVideos('${violation.flaggedVideo.id}', '${violation.matchedVideo.id}')" class="btn-small">Compare</button>
            <button onclick="viewUserViolations('${violation.flaggedVideoOwner.id}')" class="btn-small">User History</button>
        </td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    
    // Add pagination
    if (pagination.pages > 1) {
        html += `<div class="pagination">
            ${pagination.page > 1 ? `<button onclick="loadAutoCopyrightViolations(${pagination.page - 1})">Previous</button>` : ''}
            <span>Page ${pagination.page} of ${pagination.pages}</span>
            ${pagination.page < pagination.pages ? `<button onclick="loadAutoCopyrightViolations(${pagination.page + 1})">Next</button>` : ''}
        </div>`;
    }

    document.getElementById('autoCopyrightContent').innerHTML = html;
}

function renderModerationStats(statistics, timeframe) {
    const { overview, trends, copyrightByType, topViolatingUsers } = statistics;
    
    let html = `
        <div class="moderation-overview">
            <h3>Content Moderation Overview (${timeframe})</h3>
            <div class="stats-grid">
                <div class="stat-card">
                    <h4>🔞 NSFW Violations</h4>
                    <div class="stat-number">${overview.totalNSFWViolations}</div>
                </div>
                <div class="stat-card">
                    <h4>©️ Copyright Violations</h4>
                    <div class="stat-number">${overview.totalCopyrightViolations}</div>
                </div>
                <div class="stat-card">
                    <h4>📊 Total Violations</h4>
                    <div class="stat-number">${overview.totalViolations}</div>
                </div>
            </div>
        </div>

        <div class="moderation-details">
            <div class="copyright-types">
                <h4>Copyright Violations by Type</h4>
                <div class="type-stats">
                    <div>Video Fingerprint: ${copyrightByType.video_fingerprint || 0}</div>
                    <div>Audio Fingerprint: ${copyrightByType.audio_fingerprint || 0}</div>
                </div>
            </div>

            <div class="top-violators">
                <h4>Top Violating Users</h4>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>NSFW</th>
                            <th>Copyright</th>
                            <th>Total</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    topViolatingUsers.forEach(user => {
        html += '<tr>';
        html += `<td>
            <div class="user-info">
                <img src="${user.profilePhoto || '/default-avatar.png'}" alt="Avatar" style="width: 30px; height: 30px; border-radius: 50%;">
                <div>
                    <div>${user.username}</div>
                    <div class="user-email">${user.email}</div>
                </div>
            </div>
        </td>`;
        html += `<td>${user.nsfwViolations}</td>`;
        html += `<td>${user.copyrightViolations}</td>`;
        html += `<td><strong>${user.totalViolations}</strong></td>`;
        html += `<td>
            <button onclick="viewUserViolations('${user.id}')" class="btn-small">View Details</button>
        </td>`;
        html += '</tr>';
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('moderationStatsContent').innerHTML = html;
}

async function viewUserViolations(userId) {
    try {
        const response = await makeAuthenticatedRequest(`/api/v1/admin/user/${userId}/violations`);
        const data = await response.json();
        
        if (data.success) {
            // Create a modal or new section to show user violation details
            showUserViolationModal(data);
        }
    } catch (error) {
        alert('Error loading user violations');
    }
}

function showUserViolationModal(data) {
    const { user, violations, statistics } = data;
    
    const modalHtml = `
        <div class="modal-overlay" onclick="closeModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>Violations for ${user.username}</h3>
                    <button onclick="closeModal()" class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="user-violation-stats">
                        <div>NSFW Violations: ${statistics.totalNSFWViolations}</div>
                        <div>Copyright Violations: ${statistics.totalCopyrightViolations}</div>
                        <div>Total: ${statistics.totalViolations}</div>
                    </div>
                    <div class="violations-list">
                        <h4>Recent Violations</h4>
                        ${violations.nsfw.map(v => `
                            <div class="violation-item">
                                <span class="violation-type nsfw">NSFW</span>
                                <span>${v.video?.name || 'Deleted Video'}</span>
                                <span>${new Date(v.detectedAt).toLocaleDateString()}</span>
                            </div>
                        `).join('')}
                        ${violations.copyright.map(v => `
                            <div class="violation-item">
                                <span class="violation-type copyright">Copyright (${v.fingerprintType})</span>
                                <span>${v.flaggedVideo?.name || 'Deleted Video'}</span>
                                <span>${new Date(v.detectedAt).toLocaleDateString()}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
}

function viewVideoDetails(videoId) {
    // Implement video details view
    alert(`View video details for ID: ${videoId}`);
}

function compareVideos(flaggedId, matchedId) {
    // Implement video comparison view
    alert(`Compare videos: ${flaggedId} vs ${matchedId}`);
}
