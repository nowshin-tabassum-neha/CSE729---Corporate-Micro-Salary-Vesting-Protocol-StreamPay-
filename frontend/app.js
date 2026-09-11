const CONTRACT_ADDRESS =
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const CONTRACT_ABI = [
    "function admin() view returns (address)",
    "function companyIdOf(address) view returns (uint256)",
    "function registerCompany(string name)",
    "function registerEmployee(address employee)",
    "function employees(uint256 companyId, address employee) view returns (bool)",
    "function createStream(address employee, uint256 duration) payable returns (uint256)",
    "event StreamCreated(uint256 indexed streamId, uint256 indexed companyId, address indexed employee, address employer, uint256 totalDeposit, uint256 startTime, uint256 duration)",
    "function streams(uint256) view returns (uint256 companyId, address employer, address employee, uint256 totalDeposit, uint256 startTime, uint256 duration, uint256 totalWithdrawn, bool closed)",
    "function withdraw(uint256 streamId)",
    "function cancelStream(uint256 streamId)",
    "function adminFeeBalance() view returns (uint256)",
    "function claimAdminFees()",
    "function nextCompanyId() view returns (uint256)",
    "function nextStreamId() view returns (uint256)",
    "event SalaryWithdrawn(uint256 indexed streamId, address indexed employee, uint256 grossAmount, uint256 employeeAmount, uint256 fee)",
    "event StreamCancelled(uint256 indexed streamId, address indexed cancelledBy, uint256 employeeAmount, uint256 employerRefund, uint256 fee)",
    "event AdminFeesClaimed(address indexed admin, uint256 amount)",
    "function companies(uint256) view returns (address owner, string name)",
];

const connectButton = document.getElementById("connectButton");
const walletStatus = document.getElementById("walletStatus");
const networkStatus = document.getElementById("networkStatus");
const roleStatus = document.getElementById("roleStatus");
const contractStatus = document.getElementById("contractStatus");

let provider;
let signer;
let contract;

const cancelStreamButton =
    document.getElementById("cancelStreamButton");
const cancelStatus = document.getElementById("cancelStatus");

const adminPanel = document.getElementById("adminPanel");
const adminFeeDisplay = document.getElementById("adminFeeDisplay");
const refreshFeesButton = document.getElementById("refreshFeesButton");
const claimFeesButton = document.getElementById("claimFeesButton");
const adminFeeStatus = document.getElementById("adminFeeStatus");

let cancellationPending = false;
let feeClaimPending = false;

const companyPanel = document.getElementById("companyPanel");

const contractPanel =
    document.getElementById("contractPanel");

const streamViewerPanel =
    document.getElementById("streamViewerPanel");

let hasRegisteredRole = false;

const totalsPanel = document.getElementById("totalsPanel");
const totalsTitle = document.getElementById("totalsTitle");
const totalsStatus = document.getElementById("totalsStatus");
const totalCardThree = document.getElementById("totalCardThree");

const totalLabels = [
    document.getElementById("totalLabelOne"),
    document.getElementById("totalLabelTwo"),
    document.getElementById("totalLabelThree")
];

const totalValues = [
    document.getElementById("totalValueOne"),
    document.getElementById("totalValueTwo"),
    document.getElementById("totalValueThree")
];

const employeePanel = document.getElementById("employeePanel");
const createStreamPanel = document.getElementById("createStreamPanel");

const streamListsPanel =
    document.getElementById("streamListsPanel");
const refreshStreamsButton =
    document.getElementById("refreshStreamsButton");
const streamListsStatus =
    document.getElementById("streamListsStatus");
const outgoingStreams =
    document.getElementById("outgoingStreams");
const incomingStreams =
    document.getElementById("incomingStreams");


const outgoingStreamsPanel =
    document.getElementById("outgoingStreamsPanel");

const incomingStreamsPanel =
    document.getElementById("incomingStreamsPanel");

const adminStreamsPanel =
    document.getElementById("adminStreamsPanel");

const adminOpenStreams =
    document.getElementById("adminOpenStreams");

const adminClosedStreams =
    document.getElementById("adminClosedStreams");

let streamListRequest = 0;

const syncStatus = document.getElementById("syncStatus");

let eventContract = null;
let liveUpdateTimer = null;
let liveUpdateRunning = false;
let liveUpdateQueued = false;


const salaryVisual = document.getElementById("salaryVisual");
const claimableValue = document.getElementById("claimableValue");
const netSalary = document.getElementById("netSalary");
const streamBadge = document.getElementById("streamBadge");
const progressPercentage = document.getElementById("progressPercentage");
const salaryProgress = document.getElementById("salaryProgress");
const streamTime = document.getElementById("streamTime");

async function connectWallet(requestPermission = false) {
    connectButton.disabled = true;

    hasRegisteredRole = false;
    totalsPanel.hidden = true;
    contractPanel.hidden = true;
    streamViewerPanel.hidden = true;

    companyPanel.hidden = true;
    employeePanel.hidden = true;
    createStreamPanel.hidden = true;

    streamListRequest++;
    streamListsPanel.hidden = true;
    outgoingStreams.replaceChildren();
    incomingStreams.replaceChildren();

    adminOpenStreams.replaceChildren();
    adminClosedStreams.replaceChildren();

    outgoingStreamsPanel.hidden = true;
    incomingStreamsPanel.hidden = true;
    adminStreamsPanel.hidden = true;

    clearInterval(salaryTimer);
    salaryTimer = null;
    loadedStream = null;

    withdrawButton.disabled = true;
    cancelStreamButton.disabled = true;

    streamDetails.textContent = "No stream loaded.";
    salaryCounter.textContent = "Claimable salary: —";
    withdrawStatus.textContent = "";
    cancelStatus.textContent = "";

    provider = null;
    signer = null;
    contract = null;

    walletStatus.textContent = "Checking wallet...";
    networkStatus.textContent = "Network not checked.";
    roleStatus.textContent = "Role not checked.";
    contractStatus.textContent = "Contract not checked.";

    adminPanel.hidden = true;
    claimFeesButton.disabled = true;

    try {

        await stopLiveUpdates();

        if (!window.ethereum) {
            throw new Error("Open this page in a browser with MetaMask.");
        }

        if (!window.ethers) {
            throw new Error("Ethers.js did not load. Check your internet connection.");
        }

        const accounts = await window.ethereum.request({
            method: requestPermission
                ? "eth_requestAccounts"
                : "eth_accounts"
        });

        if (accounts.length === 0) {
            walletStatus.textContent = "Click Connect MetaMask to connect.";
            return;
        }

        walletStatus.textContent = `Connected: ${accounts[0]}`;

        provider = new ethers.BrowserProvider(window.ethereum);

        const network = await provider.getNetwork();

        networkStatus.textContent = `Chain ID: ${network.chainId}`;

        if (network.chainId !== 31337n) {
            throw new Error("Select Anvil Local in MetaMask, then reconnect.");
        }

        const code = await provider.getCode(CONTRACT_ADDRESS);

        if (code === "0x") {
            throw new Error("No contract found. Was Anvil restarted after deployment?");
        }

        signer = await provider.getSigner(accounts[0]);

        contract = new ethers.Contract(
            CONTRACT_ADDRESS,
            CONTRACT_ABI,
            signer
        );

        const adminAddress = await contract.admin();
        const companyId = await contract.companyIdOf(accounts[0]);

        contractStatus.textContent =
            `Contract connected. Admin: ${adminAddress}`;

        await updateRoleView(accounts[0], adminAddress, companyId);

        await refreshAdminFees();
        await refreshStreamLists();
        await startLiveUpdates();
        

    } catch (error) {
        contract = null;
        signer = null;

        contractStatus.textContent =
            `Error: ${error.shortMessage || error.message}`;

        console.error(error);
    } finally {
        connectButton.disabled = false;
    }
}

connectButton.addEventListener("click", () => {
    connectWallet(true);
});

if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => {
        window.location.reload();
    });

    window.ethereum.on("chainChanged", () => {
        window.location.reload();
    });
}



const companyForm = document.getElementById("companyForm");
const companyNameInput = document.getElementById("companyName");
const companyStatus = document.getElementById("companyStatus");
const registerCompanyButton =
    document.getElementById("registerCompanyButton");

companyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!contract || !signer) {
        companyStatus.textContent =
            "Connect your wallet on Anvil Local first.";
        return;
    }

    const name = companyNameInput.value.trim();

    if (name.length === 0) {
        companyStatus.textContent = "Enter a company name.";
        return;
    }

    registerCompanyButton.disabled = true;

    try {
        const connectedAddress = await signer.getAddress();
        const existingId = await contract.companyIdOf(connectedAddress);

        if (existingId !== 0n) {
            companyStatus.textContent =
                `This wallet already owns company ${existingId}.`;
            return;
        }

        companyStatus.textContent =
            "Approve company registration in MetaMask.";

        const tx = await contract.registerCompany(name);

        companyStatus.textContent =
            `Transaction submitted. Waiting for confirmation: ${tx.hash}`;

        await tx.wait();

        const companyId = await contract.companyIdOf(connectedAddress);

        companyStatus.textContent =
            `Company "${name}" registered successfully. Company ID: ${companyId}`;

        companyForm.reset();

        await connectWallet();
    } catch (error) {
        companyStatus.textContent =
            `Registration failed: ${error.reason || error.shortMessage || error.message}`;

        console.error(error);
    } finally {
        registerCompanyButton.disabled = false;
    }
});


const employeeForm = document.getElementById("employeeForm");
const employeeAddressInput =
    document.getElementById("employeeAddress");
const employeeStatus = document.getElementById("employeeStatus");
const registerEmployeeButton =
    document.getElementById("registerEmployeeButton");

employeeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!contract || !signer) {
        employeeStatus.textContent =
            "Connect your employer wallet on Anvil Local first.";
        return;
    }

    const employeeAddress = employeeAddressInput.value.trim();

    if (
        !ethers.isAddress(employeeAddress) ||
        employeeAddress.toLowerCase() === ethers.ZeroAddress
    ) {
        employeeStatus.textContent =
            "Enter a valid, nonzero employee wallet address.";
        return;
    }

    registerEmployeeButton.disabled = true;

    try {
        const employerAddress = await signer.getAddress();
        const companyId = await contract.companyIdOf(employerAddress);

        if (companyId === 0n) {
            employeeStatus.textContent =
                "This wallet must register a company first.";
            return;
        }

        const alreadyRegistered = await contract.employees(
            companyId,
            employeeAddress
        );

        if (alreadyRegistered) {
            employeeStatus.textContent =
                `This employee is already registered under company ${companyId}.`;
            return;
        }

        employeeStatus.textContent =
            "Approve employee registration in MetaMask.";

        const tx = await contract.registerEmployee(employeeAddress);

        employeeStatus.textContent =
            `Transaction submitted. Waiting for confirmation: ${tx.hash}`;

        await tx.wait();

        const registered = await contract.employees(
            companyId,
            employeeAddress
        );

        if (!registered) {
            throw new Error("Employee registration could not be verified.");
        }

        employeeStatus.textContent =
            `Employee ${employeeAddress} registered under company ${companyId}.`;

        employeeForm.reset();
    } catch (error) {
        employeeStatus.textContent =
            `Registration failed: ${error.reason || error.shortMessage || error.message}`;

        console.error(error);
    } finally {
        registerEmployeeButton.disabled = false;
    }
});

const streamForm = document.getElementById("streamForm");
const streamEmployeeInput = document.getElementById("streamEmployee");
const streamDurationInput = document.getElementById("streamDuration");
const streamAmountInput = document.getElementById("streamAmount");
const streamStatus = document.getElementById("streamStatus");
const createStreamButton = document.getElementById("createStreamButton");

streamForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!contract || !signer) {
        streamStatus.textContent =
            "Connect your employer wallet on Anvil Local first.";
        return;
    }

    createStreamButton.disabled = true;

    try {
        const employeeAddress = streamEmployeeInput.value.trim();
        const durationText = streamDurationInput.value.trim();
        const amountText = streamAmountInput.value.trim();

        if (
            !ethers.isAddress(employeeAddress) ||
            employeeAddress.toLowerCase() === ethers.ZeroAddress
        ) {
            throw new Error("Enter a valid, nonzero employee address.");
        }

        if (!/^\d+$/.test(durationText)) {
            throw new Error("Duration must be a whole number of seconds.");
        }

        const duration = BigInt(durationText);

        if (duration <= 15n || duration > ethers.MaxUint256) {
            throw new Error("Enter a valid duration greater than 15 seconds.");
        }

        const deposit = ethers.parseEther(amountText);

        if (deposit <= 0n) {
            throw new Error("The deposit must be greater than zero.");
        }

        const activeContract = contract;
        const employerAddress = await signer.getAddress();

        const companyId =
            await activeContract.companyIdOf(employerAddress);

        if (companyId === 0n) {
            throw new Error("Register a company with this wallet first.");
        }

        const registered = await activeContract.employees(
            companyId,
            employeeAddress
        );

        if (!registered) {
            throw new Error("Register this employee under your company first.");
        }

        streamStatus.textContent =
            "Approve the salary deposit and gas fee in MetaMask.";

        const tx = await activeContract.createStream(
            employeeAddress,
            duration,
            { value: deposit }
        );

        streamStatus.textContent =
            `Transaction submitted. Waiting for confirmation: ${tx.hash}`;

        const receipt = await tx.wait();

        let createdEvent = null;

        for (const log of receipt.logs) {
            if (
                log.address.toLowerCase() !==
                CONTRACT_ADDRESS.toLowerCase()
            ) {
                continue;
            }

            try {
                const parsed = activeContract.interface.parseLog(log);

                if (parsed && parsed.name === "StreamCreated") {
                    createdEvent = parsed;
                    break;
                }
            } catch {
                // Ignore logs not described by our ABI.
            }
        }

        if (createdEvent) {
            streamStatus.textContent =
                `Stream ${createdEvent.args.streamId} created successfully. ` +
                `Deposit: ${ethers.formatEther(createdEvent.args.totalDeposit)} ETH. ` +
                `Duration: ${createdEvent.args.duration} seconds.`;
        } else {
            streamStatus.textContent =
                `Transaction confirmed: ${tx.hash}. ` +
                "Could not read the stream ID; check before submitting again.";
        }

        await refreshStreamLists();
    } catch (error) {
        streamStatus.textContent =
            `Could not complete stream creation: ${
                error.reason || error.shortMessage || error.message
            }`;

        console.error(error);
    } finally {
        createStreamButton.disabled = false;
    }
});

createStreamButton.disabled = false;

streamStatus.textContent =
    "Form ready. We will create a stream after adding the withdrawal interface.";

    const viewStreamForm = document.getElementById("viewStreamForm");
const viewStreamIdInput = document.getElementById("viewStreamId");
const streamDetails = document.getElementById("streamDetails");
const salaryCounter = document.getElementById("salaryCounter");
const withdrawButton = document.getElementById("withdrawButton");
const withdrawStatus = document.getElementById("withdrawStatus");

let loadedStream = null;
let salaryTimer = null;
let withdrawalPending = false;

function calculateClaimable() {
    if (!loadedStream || loadedStream.data.closed) {
        return 0n;
    }

    const stream = loadedStream.data;

    const secondsSinceFetch = BigInt(
        Math.floor((performance.now() - loadedStream.fetchedAt) / 1000)
    );

    const estimatedTime =
        loadedStream.blockTime + secondsSinceFetch;

    let elapsed = estimatedTime - stream.startTime;

    if (elapsed < 0n) elapsed = 0n;
    if (elapsed > stream.duration) elapsed = stream.duration;

    const unlocked =
        (stream.totalDeposit * elapsed) / stream.duration;

    const claimable = unlocked - stream.totalWithdrawn;

    return claimable > 0n ? claimable : 0n;
}

function renderSalaryCounter() {
    if (!loadedStream) {
        salaryVisual.hidden = true;
        return;
    }

    salaryVisual.hidden = false;

    const stream = loadedStream.data;

    const gross = calculateClaimable();
    const fee = gross / 100n;
    const net = gross - fee;

    let elapsed;
    let unlocked;

    if (stream.closed) {
        // Closed streams retain their final gross settled amount.
        unlocked = stream.totalWithdrawn;
    } else {
        const secondsSinceFetch = BigInt(
            Math.floor(
                (performance.now() - loadedStream.fetchedAt) / 1000
            )
        );

        const estimatedTime =
            loadedStream.blockTime + secondsSinceFetch;

        elapsed = estimatedTime - stream.startTime;

        if (elapsed < 0n) elapsed = 0n;
        if (elapsed > stream.duration) elapsed = stream.duration;

        unlocked =
            (stream.totalDeposit * elapsed) / stream.duration;
    }

    // Integer calculation first; convert only the bounded percentage.
    const hundredthsOfPercent =
        (unlocked * 10000n) / stream.totalDeposit;

    const percentage = Number(hundredthsOfPercent) / 100;

    claimableValue.textContent = formatDisplayEth(gross);

    // Hover to inspect the full precision.
    claimableValue.title = `${ethers.formatEther(gross)} ETH`;

    netSalary.textContent =
        `After protocol fee: ${formatDisplayEth(net)} ETH. Gas is separate.`;

    progressPercentage.textContent = `${percentage.toFixed(2)}%`;
    salaryProgress.value = percentage;

    if (stream.closed) {
        streamBadge.textContent = "Closed";
        streamBadge.dataset.state = "closed";

        streamTime.textContent =
            unlocked === stream.totalDeposit
                ? "Fully settled. No salary remains to claim."
                : "Ended early. Progress is frozen at the final earned amount.";
    } else if (elapsed >= stream.duration) {
        streamBadge.textContent = "Fully unlocked";
        streamBadge.dataset.state = "complete";

        streamTime.textContent =
            "The full duration has elapsed. Remaining salary is available to claim.";
    } else {
        streamBadge.textContent = "Streaming";
        streamBadge.dataset.state = "streaming";

        streamTime.textContent =
            `${formatDuration(elapsed)} elapsed · ` +
            `${formatDuration(stream.duration - elapsed)} remaining`;
    }

    salaryCounter.textContent = stream.closed
        ? "Final stream settlement."
        : "Estimated from blockchain time; updates every second.";

    const busy = withdrawalPending || cancellationPending;

    withdrawButton.disabled =
        busy ||
        !loadedStream.isEmployee ||
        stream.closed ||
        gross === 0n;

    cancelStreamButton.disabled =
        busy ||
        stream.closed ||
        !(loadedStream.isEmployee || loadedStream.isEmployer);
}

function renderStreamDetails(streamId, stream) {
    streamDetails.replaceChildren();

    const heading = document.createElement("h3");
    heading.className = "stream-summary-title";
    heading.textContent = `Stream #${streamId}`;

    const fields = document.createElement("dl");
    fields.className = "stream-summary-grid";

    function addField(label, value, fullValue = "") {
        const field = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");

        term.textContent = label;
        description.textContent = value;

        if (fullValue) {
            description.title = fullValue;
        }

        field.append(term, description);
        fields.appendChild(field);
    }

    const shortAddress =
        `${stream.employee.slice(0, 6)}…${stream.employee.slice(-4)}`;

    addField("Status", stream.closed ? "Closed" : "Open");

    addField(
        "Employee wallet",
        shortAddress,
        stream.employee
    );

    addField(
        "Total salary",
        `${formatDisplayEth(stream.totalDeposit)} ETH`,
        `${ethers.formatEther(stream.totalDeposit)} ETH`
    );

    addField(
        "Duration",
        formatDuration(stream.duration)
    );

    addField(
        "Salary settled · before fees",
        `${formatDisplayEth(stream.totalWithdrawn)} ETH`,
        `${ethers.formatEther(stream.totalWithdrawn)} ETH`
    );

    streamDetails.append(heading, fields);
}

async function loadStream(streamId) {
    clearInterval(salaryTimer);
    salaryTimer = null;
    loadedStream = null;

    salaryVisual.hidden = true;

    withdrawButton.disabled = true;
    cancelStreamButton.disabled = true;
    salaryCounter.textContent = "Claimable salary: —";
    streamDetails.textContent = "Loading stream...";

    if (!contract || !provider || !signer) {
        throw new Error("Connect your wallet on Anvil Local first.");
    }

    const activeContract = contract;

    // Read the record at the same block whose timestamp we use.
    const block = await provider.getBlock("latest");

    if (!block) {
        throw new Error("Could not read the latest block.");
    }

    const stream = await activeContract.streams(
        streamId,
        { blockTag: block.number }
    );

    if (stream.employer === ethers.ZeroAddress) {
        throw new Error("This stream does not exist.");
    }

    const walletAddress = await signer.getAddress();

    loadedStream = {
    id: streamId,
    data: stream,
    blockTime: BigInt(block.timestamp),
    fetchedAt: performance.now(),
    isEmployee:
        walletAddress.toLowerCase() === stream.employee.toLowerCase(),
    isEmployer:
        walletAddress.toLowerCase() === stream.employer.toLowerCase()
    };

    renderStreamDetails(streamId, stream);

    renderSalaryCounter();
    salaryTimer = setInterval(renderSalaryCounter, 1000);
}

viewStreamForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
        const idText = viewStreamIdInput.value.trim();

        if (!/^[1-9]\d*$/.test(idText)) {
            throw new Error("Enter a positive whole-number stream ID.");
        }

        await loadStream(BigInt(idText));
        withdrawStatus.textContent = "";
    } catch (error) {
        streamDetails.textContent =
            error.shortMessage || error.message;
    }
});

withdrawButton.addEventListener("click", async () => {
    if (
        !loadedStream ||
        !loadedStream.isEmployee ||
        !contract ||
        withdrawalPending
    ) {
        return;
    }

    const streamId = loadedStream.id;
    const activeContract = contract;

    withdrawalPending = true;
    renderSalaryCounter();

    try {
        withdrawStatus.textContent =
            "Approve the withdrawal in MetaMask.";

        const tx = await activeContract.withdraw(streamId);

        withdrawStatus.textContent =
            `Withdrawal submitted: ${tx.hash}`;

        await tx.wait();

        withdrawStatus.textContent =
            "Withdrawal confirmed. Refreshing the salary record...";

        await loadStream(streamId);
        await refreshStreamLists();

        withdrawStatus.textContent =
            "Withdrawal confirmed and salary record refreshed.";
    } catch (error) {
        withdrawStatus.textContent =
            `Withdrawal or refresh failed: ${
                error.reason || error.shortMessage || error.message
            }. Reload the stream before retrying.`;
    } finally {
        withdrawalPending = false;
        renderSalaryCounter();
    }
});



cancelStreamButton.addEventListener("click", async () => {
    if (
        !loadedStream ||
        !contract ||
        withdrawalPending ||
        cancellationPending ||
        loadedStream.data.closed ||
        !(loadedStream.isEmployee || loadedStream.isEmployer)
    ) {
        return;
    }

    const streamId = loadedStream.id;
    const activeContract = contract;

    cancellationPending = true;
    renderSalaryCounter();

    try {
        cancelStatus.textContent =
            "Approve cancellation in MetaMask.";

        const tx = await activeContract.cancelStream(streamId);

        cancelStatus.textContent =
            `Cancellation submitted: ${tx.hash}`;

        await tx.wait();

        cancelStatus.textContent =
            "Cancellation confirmed. Refreshing the stream...";

        await loadStream(streamId);
        await refreshStreamLists();

        cancelStatus.textContent =
            "Stream cancelled. Earned salary was settled and unearned salary refunded.";
    } catch (error) {
        cancelStatus.textContent =
            `Cancellation or refresh failed: ${
                error.reason || error.shortMessage || error.message
            }. Reload the stream before retrying.`;
    } finally {
        cancellationPending = false;
        renderSalaryCounter();
    }
});
async function refreshAdminFees() {
    claimFeesButton.disabled = true;

    if (!contract || !signer) {
        adminPanel.hidden = true;
        return;
    }

    const activeContract = contract;
    const walletAddress = await signer.getAddress();
    const adminAddress = await activeContract.admin();

    const isAdmin =
        walletAddress.toLowerCase() === adminAddress.toLowerCase();

    adminPanel.hidden = !isAdmin;

    if (!isAdmin) return;

    const fees = await activeContract.adminFeeBalance();

    adminFeeDisplay.textContent =
        `Available protocol fees: ${ethers.formatEther(fees)} ETH`;

    claimFeesButton.disabled = feeClaimPending || fees === 0n;
}

refreshFeesButton.addEventListener("click", async () => {
    try {
        await refreshAdminFees();
        adminFeeStatus.textContent = "";
    } catch (error) {
        adminFeeStatus.textContent =
            error.shortMessage || error.message;
    }
});

claimFeesButton.addEventListener("click", async () => {
    if (!contract || !signer || feeClaimPending) return;

    const activeContract = contract;

    feeClaimPending = true;
    claimFeesButton.disabled = true;

    try {
        adminFeeStatus.textContent =
            "Approve the fee withdrawal in MetaMask.";

        const tx = await activeContract.claimAdminFees();

        adminFeeStatus.textContent =
            `Fee withdrawal submitted: ${tx.hash}`;

        await tx.wait();

        adminFeeStatus.textContent =
            "Admin fee withdrawal confirmed.";
    } catch (error) {
        adminFeeStatus.textContent =
            `Fee withdrawal failed: ${
                error.reason || error.shortMessage || error.message
            }`;
    } finally {
        feeClaimPending = false;

        try {
            await refreshAdminFees();
        } catch (error) {
            adminFeeStatus.textContent +=
                " Could not refresh the fee balance. Click Refresh fees.";
        }
    }
});

async function updateRoleView(walletAddress, adminAddress, companyId) {
    const isAdmin =
        walletAddress.toLowerCase() === adminAddress.toLowerCase();

    const isEmployer = companyId > 0n;
    const employeeCompanies = [];

    const nextCompanyId = await contract.nextCompanyId();

    for (let id = 1n; id < nextCompanyId; id++) {
        const registered = await contract.employees(id, walletAddress);

        if (registered) {
            const company = await contract.companies(id);

            employeeCompanies.push(
                `${company.name} (Company #${id})`
            );
        }
    }

    const roles = [];

    if (isAdmin) {
        roles.push("Protocol admin");
    }

    if (isEmployer) {
        const company = await contract.companies(companyId);

        roles.push(
            `Employer — ${company.name} (Company #${companyId})`
        );
    }

    if (employeeCompanies.length > 0) {
        roles.push(
            `Employee — ${employeeCompanies.join(", ")}`
        );
    }

    roleStatus.textContent = roles.length > 0
        ? `Role: ${roles.join(" | ")}`
        : "No company ownership or employee registration found.";

    // Reserve the admin account for administration in our demo.
    const isEmployee = employeeCompanies.length > 0;

    hasRegisteredRole =
        isAdmin || isEmployer || isEmployee;

    companyPanel.hidden = hasRegisteredRole;

    employeePanel.hidden = isAdmin || !isEmployer;
    createStreamPanel.hidden = isAdmin || !isEmployer;

    contractPanel.hidden = !hasRegisteredRole;
    streamViewerPanel.hidden = !hasRegisteredRole;

    companyStatus.textContent =
        "Register your company using the connected wallet. " +
        "This wallet will become its owner.";

    streamStatus.textContent =
        "Create a funded salary stream for a registered employee.";
}

async function refreshAccountTotals(
    activeContract,
    block,
    allStreams,
    walletAddress,
    isAdmin,
    isEmployer,
    requestId
) {
    const stillCurrent = () =>
        requestId === streamListRequest &&
        contract === activeContract;

    if (!stillCurrent()) return;

    totalsPanel.hidden = false;
    totalCardThree.hidden = !isEmployer || isAdmin;

    totalValues.forEach((element) => {
        element.textContent = "—";
        element.removeAttribute("title");
    });

    const labels = isAdmin
        ? ["Fees collected", "Fees available to claim"]
        : isEmployer
            ? [
                "Total salary deposited",
                "Salary settled · before fees",
                "Refunds received"
            ]
            : [
                "Salary received · after fees",
                "Claimable · before fees"
            ];

    totalsTitle.textContent = isAdmin
        ? "Protocol overview"
        : isEmployer
            ? "Company overview"
            : "Your salary overview";

    labels.forEach((label, index) => {
        totalLabels[index].textContent = label;
    });

    totalsStatus.textContent = "Reading account totals…";

    function showValue(index, amount) {
        totalValues[index].textContent = formatDisplayEth(amount);
        totalValues[index].title =
            `${ethers.formatEther(amount)} ETH`;
    }

    const ownStreams = allStreams.filter(({ stream }) =>
        isEmployer
            ? stream.employer.toLowerCase() === walletAddress
            : stream.employee.toLowerCase() === walletAddress
    );

    // Employer totals can be reconstructed from stored records.
    if (isEmployer && !isAdmin) {
        let deposited = 0n;
        let settled = 0n;
        let refunded = 0n;

        for (const { stream } of ownStreams) {
            deposited += stream.totalDeposit;
            settled += stream.totalWithdrawn;

            if (stream.closed) {
                refunded +=
                    stream.totalDeposit - stream.totalWithdrawn;
            }
        }

        showValue(0, deposited);
        showValue(1, settled);
        showValue(2, refunded);

        totalsStatus.textContent =
            "Totals across your streams. Gas costs are excluded.";
        return;
    }

    try {
        let availableFees = 0n;

        if (isAdmin) {
            availableFees = await activeContract.adminFeeBalance({
                blockTag: block.number
            });

            if (!stillCurrent()) return;
            showValue(1, availableFees);
        } else {
            let claimable = 0n;

            for (const { stream } of ownStreams) {
                if (stream.closed) continue;

                let elapsed =
                    BigInt(block.timestamp) - stream.startTime;

                if (elapsed < 0n) elapsed = 0n;
                if (elapsed > stream.duration) {
                    elapsed = stream.duration;
                }

                const unlocked =
                    (stream.totalDeposit * elapsed) /
                    stream.duration;

                const remaining =
                    unlocked - stream.totalWithdrawn;

                if (remaining > 0n) {
                    claimable += remaining;
                }
            }

            showValue(1, claimable);
        }

        const [withdrawals, cancellations] = await Promise.all([
            activeContract.queryFilter(
                "SalaryWithdrawn",
                0,
                block.number
            ),
            activeContract.queryFilter(
                "StreamCancelled",
                0,
                block.number
            )
        ]);

        if (!stillCurrent()) return;

        const payments = new Map();

        function recordPayment(id, gross, net, fee) {
            const key = id.toString();

            const total = payments.get(key) || {
                gross: 0n,
                net: 0n,
                fee: 0n
            };

            total.gross += gross;
            total.net += net;
            total.fee += fee;

            payments.set(key, total);
        }

        for (const event of withdrawals) {
            const payment = event.args;

            recordPayment(
                payment.streamId,
                payment.grossAmount,
                payment.employeeAmount,
                payment.fee
            );
        }

        for (const event of cancellations) {
            const payment = event.args;

            recordPayment(
                payment.streamId,
                payment.employeeAmount + payment.fee,
                payment.employeeAmount,
                payment.fee
            );
        }

        const relevantStreams = isAdmin
            ? allStreams
            : ownStreams;

        // Check that payment history matches stored settlements.
        const completeHistory = relevantStreams.every(
            ({ id, stream }) =>
                (payments.get(id.toString())?.gross ?? 0n) ===
                stream.totalWithdrawn
        );

        if (!completeHistory) {
            totalValues[0].textContent = "Unavailable";

            totalsStatus.textContent =
                "Earlier payment history is incomplete. " +
                "The current available amount is still shown.";
            return;
        }

        if (isAdmin) {
            let feesEarned = 0n;

            for (const { id } of allStreams) {
                feesEarned +=
                    payments.get(id.toString())?.fee ?? 0n;
            }

            if (feesEarned < availableFees) {
                throw new Error("Fee history does not match storage.");
            }

            showValue(0, feesEarned - availableFees);

            totalsStatus.textContent =
                "Collected fees have been paid to the admin. " +
                "Available fees remain in the contract.";
        } else {
            let received = 0n;

            for (const { id } of ownStreams) {
                received +=
                    payments.get(id.toString())?.net ?? 0n;
            }

            showValue(0, received);

            totalsStatus.textContent =
                "Received salary excludes protocol fees. " +
                "Gas costs are excluded. Claimable updates " +
                "when streams refresh.";
        }
    } catch (error) {
        if (!stillCurrent()) return;

        totalValues[0].textContent = "Unavailable";

        totalsStatus.textContent =
            "Could not read complete payment totals. " +
            "Click Refresh stream lists to retry.";

        console.error("Account totals:", error);
    }
}

async function refreshStreamLists() {
    const requestId = ++streamListRequest;

    outgoingStreamsPanel.hidden = true;
    incomingStreamsPanel.hidden = true;
    adminStreamsPanel.hidden = true;

    outgoingStreams.replaceChildren();
    incomingStreams.replaceChildren();
    adminOpenStreams.replaceChildren();
    adminClosedStreams.replaceChildren();

    if (
        !contract ||
        !provider ||
        !signer ||
        !hasRegisteredRole
    ) {
        streamListsPanel.hidden = true;
        return;
    }

    streamListsPanel.hidden = false;
    refreshStreamsButton.disabled = true;
    streamListsStatus.textContent = "Loading streams...";

    const activeContract = contract;
    const activeProvider = provider;
    const activeSigner = signer;

    try {
        const walletAddress =
            (await activeSigner.getAddress()).toLowerCase();

        const block = await activeProvider.getBlock("latest");

        if (!block) {
            throw new Error("Could not read the latest block.");
        }

        const blockOptions = { blockTag: block.number };

        const adminAddress =
            await activeContract.admin(blockOptions);

        const companyId = await activeContract.companyIdOf(
            walletAddress,
            blockOptions
        );

        const isAdmin =
            walletAddress === adminAddress.toLowerCase();

        const isEmployer = companyId > 0n;

        const nextId =
            await activeContract.nextStreamId(blockOptions);

        const outgoing = [];
        const incoming = [];
        const open = [];
        const closed = [];
        const allStreams = [];

        for (let id = 1n; id < nextId; id++) {
            const stream = await activeContract.streams(
                id,
                blockOptions
            );

            if (requestId !== streamListRequest) return;

            const entry = { id, stream };
            allStreams.push(entry);

            if (isAdmin) {
                if (stream.closed) {
                    closed.push(entry);
                } else {
                    open.push(entry);
                }
            } else if (isEmployer) {
                if (
                    stream.employer.toLowerCase() === walletAddress
                ) {
                    outgoing.push(entry);
                }
            } else {
                if (
                    stream.employee.toLowerCase() === walletAddress
                ) {
                    incoming.push(entry);
                }
            }
        }

        if (
            requestId !== streamListRequest ||
            contract !== activeContract
        ) {
            return;
        }

        if (isAdmin) {
            adminStreamsPanel.hidden = false;

            renderStreamList(adminOpenStreams, open, "open");
            renderStreamList(adminClosedStreams, closed, "closed");

            streamListsStatus.textContent =
                `${open.length} open · ${closed.length} closed`;
        } else if (isEmployer) {
            outgoingStreamsPanel.hidden = false;

            renderStreamList(
                outgoingStreams,
                outgoing,
                "outgoing"
            );

            streamListsStatus.textContent =
                `${outgoing.length} salary streams funded by your wallet.`;
        } else {
            incomingStreamsPanel.hidden = false;

            renderStreamList(
                incomingStreams,
                incoming,
                "incoming"
            );

            streamListsStatus.textContent =
                `${incoming.length} salary streams assigned to your wallet.`;

        }

        await refreshAccountTotals(
            activeContract,
            block,
            allStreams,
            walletAddress,
            isAdmin,
            isEmployer,
            requestId
        );
    } catch (error) {
        if (requestId === streamListRequest) {
            streamListsStatus.textContent =
                `Could not load streams: ${
                    error.shortMessage || error.message
                }`;
        }
    } finally {
        if (requestId === streamListRequest) {
            refreshStreamsButton.disabled = false;
        }
    }
}

function renderStreamList(container, entries, direction) {
    container.replaceChildren();

    if (entries.length === 0) {
        const item = document.createElement("li");
        item.textContent = `No ${direction} streams yet.`;
        container.appendChild(item);
        return;
    }

    entries.sort(
        (a, b) => Number(a.stream.closed) - Number(b.stream.closed)
    );

    for (const { id, stream } of entries) {
        const item = document.createElement("li");
        const description = document.createElement("span");
        const button = document.createElement("button");

        const shortAddress = (address) =>
            `${address.slice(0, 6)}…${address.slice(-4)}`;

        let otherParty;

        if (direction === "outgoing") {
            otherParty = `Employee: ${shortAddress(stream.employee)}`;
        } else if (direction === "incoming") {
            otherParty = `Employer: ${shortAddress(stream.employer)}`;
        } else {
            otherParty =
                `Employer: ${shortAddress(stream.employer)} · ` +
                `Employee: ${shortAddress(stream.employee)}`;
        }

        description.title =
            `Employer: ${stream.employer}\n` +
            `Employee: ${stream.employee}`;

        description.textContent =
            `Stream ${id} — ${stream.closed ? "Closed" : "Open"} — ` +
            `${ethers.formatEther(stream.totalDeposit)} ETH — ` +
            `${otherParty} `;

        button.type = "button";
        button.textContent = "View stream";

        button.addEventListener("click", async () => {
            viewStreamIdInput.value = id.toString();
            withdrawStatus.textContent = "";
            cancelStatus.textContent = "";

            try {
                await loadStream(id);

                streamDetails.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            } catch (error) {
                streamDetails.textContent =
                    error.shortMessage || error.message;
            }
        });

        item.append(description, button);
        container.appendChild(item);
    }
}

refreshStreamsButton.addEventListener("click", refreshStreamLists);

async function stopLiveUpdates() {
    clearTimeout(liveUpdateTimer);
    liveUpdateTimer = null;
    liveUpdateQueued = false;

    const previousContract = eventContract;
    eventContract = null;

    if (previousContract) {
        await previousContract.removeAllListeners();
    }

    syncStatus.textContent = "Live updates not connected.";
}

function queueLiveUpdate(sourceContract) {
    if (sourceContract !== eventContract) return;

    liveUpdateQueued = true;
    clearTimeout(liveUpdateTimer);

    liveUpdateTimer = setTimeout(() => {
        refreshAfterEvent(sourceContract);
    }, 300);
}

async function refreshAfterEvent(sourceContract) {
    if (
        sourceContract !== eventContract ||
        sourceContract !== contract
    ) {
        return;
    }

    if (
        liveUpdateRunning ||
        withdrawalPending ||
        cancellationPending ||
        feeClaimPending
    ) {
        queueLiveUpdate(sourceContract);
        return;
    }

    liveUpdateRunning = true;
    liveUpdateQueued = false;

    try {
        syncStatus.textContent =
            "Contract activity detected. Updating the display...";

        await refreshStreamLists();

        if (sourceContract !== eventContract) return;

        if (loadedStream) {
            const selectedId = loadedStream.id;
            await loadStream(selectedId);
        }

        if (sourceContract !== eventContract) return;

        await refreshAdminFees();

        syncStatus.textContent =
            "Display refreshed after contract activity.";
    } catch (error) {
        syncStatus.textContent =
            `Live refresh failed: ${
                error.shortMessage || error.message
            }. Use the refresh buttons to retry.`;
    } finally {
        liveUpdateRunning = false;

        if (
            liveUpdateQueued &&
            sourceContract === eventContract
        ) {
            queueLiveUpdate(sourceContract);
        }
    }
}

async function startLiveUpdates() {
    await stopLiveUpdates();

    if (!contract) return;

    const sourceContract = contract;
    eventContract = sourceContract;

    const events = [
        "StreamCreated",
        "SalaryWithdrawn",
        "StreamCancelled",
        "AdminFeesClaimed"
    ];

    for (const eventName of events) {
        await sourceContract.on(eventName, () => {
            queueLiveUpdate(sourceContract);
        });
    }

    syncStatus.textContent =
        "Live updates connected.";
}

function formatDisplayEth(wei) {
    const [whole, fraction = ""] = ethers.formatEther(wei).split(".");

    return `${whole}.${fraction.padEnd(6, "0").slice(0, 6)}`;
}

function formatDuration(seconds) {
    const days = seconds / 86400n;
    const hours = (seconds % 86400n) / 3600n;
    const minutes = (seconds % 3600n) / 60n;
    const remainingSeconds = seconds % 60n;

    if (days > 0n) {
        return `${days}d ${hours}h ${minutes}m`;
    }

    if (hours > 0n) {
        return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }

    return `${minutes}m ${remainingSeconds}s`;
}
connectWallet();