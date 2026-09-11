# StreamPay — Corporate Micro-Salary Vesting Protocol

StreamPay is a decentralized application for salary payments that unlock over time. Employers deposit ETH into a smart contract, and employees withdraw the portion they have earned.

The project uses Solidity, Foundry, Ethers.js, and MetaMask, with Anvil as the local development blockchain.

## Features

### Employer
- Register a company linked to the connected wallet.
- Register employee wallet addresses.
- Create funded salary streams.
- View outgoing streams and their status.
- Cancel a stream and recover the unearned portion.
- View total deposits, gross salary settled, and refunds.

### Employee
- View incoming salary streams.
- See estimated claimable salary update every second.
- Track unlocked salary with a progress bar.
- Withdraw unlocked salary.
- Cancel a stream and settle the earned portion.
- View net salary received and current gross claimable salary.

### Protocol administrator
- View all open and closed streams.
- View collected and claimable protocol fees.
- Withdraw accumulated protocol fees.

The frontend refreshes stream information after relevant contract events.

## How salary vesting works

For an active stream:

```text
elapsed = min(max(current time − start time, 0), duration)

unlocked salary = deposit × elapsed ÷ duration

claimable salary = unlocked salary − gross salary already settled
```

The contract performs integer calculations in wei.

For example, a deposit of 1 ETH over 100 seconds unlocks
0.5 ETH after 50 seconds.

A 1% protocol fee is deducted from each salary settlement.
The employee receives the remaining amount, and the fee remains
in the contract until the administrator claims it.

Gas fees are separate from the protocol fee.

### Cancellation

The employer or employee can cancel an open stream.

Cancellation:
1. Calculates the salary earned up to cancellation.
2. Pays any unsettled earned salary to the employee, minus the protocol fee.
3. Refunds the unearned portion to the employer.
4. Marks the stream closed.

A closed stream cannot be withdrawn from or cancelled again.

A stream can be fully unlocked but remain open until its remaining
salary is settled.

## Technology stack

| Component | Technology |
| --- | --- |
| Smart contract | Solidity |
| Build and testing | Foundry / Forge |
| Local blockchain | Anvil |
| Command-line interaction | Cast |
| Frontend | HTML, CSS, JavaScript |
| Blockchain library | Ethers.js v6 |
| Wallet | MetaMask |
| Development environment | Ubuntu through WSL |

## Project structure

```text
streampay/
├── src/
│   └── StreamPay.sol
├── test/
│   └── StreamPay.t.sol
├── script/
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── lib/
│   └── forge-std/
├── foundry.toml
├── foundry.lock
└── README.md
```

Additional Counter files are examples from the Foundry starter project.

## Prerequisites

Install:
- Git
- Foundry, including Forge, Anvil, and Cast
- Python 3
- MetaMask in your browser

On Windows, run the development commands inside Ubuntu through WSL.

Verify the tools:

```bash
git --version
forge --version
anvil --version
cast --version
python3 --version
```

## Clone and test

Clone the repository with its testing-library submodule:

```bash
git clone --recurse-submodules https://github.com/nowshin-tabassum-neha/CSE729---Corporate-Micro-Salary-Vesting-Protocol-StreamPay-.git streampay
cd streampay
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

Build the contracts:

```bash
forge build
```

Run the StreamPay tests:

```bash
forge test --match-contract StreamPayTest -vv
```

The StreamPay suite contains 12 tests covering:
- Administrator initialization.
- Company registration and duplicate-registration rejection.
- Time-based unlocking.
- Partial withdrawals and prevention of double claims.
- Employer and employee cancellation.
- Fee claims and access restrictions.
- Invalid stream creation.
- Payment-failure rollback.
- Reentrant withdrawal prevention.

Passing tests validate the tested cases; they do not constitute a security audit.

## Start the local blockchain

From the project root:

```bash
mkdir -p local-state
anvil --block-time 1 --chain-id 31337 --state ./local-state/anvil.json --state-interval 10
```

Leave this terminal running.

This configuration:
- Produces blocks at one-second intervals.
- Uses chain ID 31337.
- Loads the saved state file when present.
- Periodically saves state to disk.

An unexpected shutdown may lose changes made since the last saved snapshot.

## Configure MetaMask

Add a custom network:

| Setting | Value |
| --- | --- |
| Network name | Anvil Local |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Currency symbol | ETH |

For a local demonstration, use separate accounts for:
- Protocol administrator.
- Employer.
- Employee.

Anvil prints funded development accounts when it starts.
Alternatively, generate a fresh account locally:

```bash
cast wallet new
```

Import the generated private key into MetaMask and fund its public
address with test ETH from a funded Anvil account.

Never publish private keys or recovery phrases.
Anvil's default accounts are publicly known development accounts
and must not hold real funds.

## Deploy StreamPay

In a second terminal, from the project root:

```bash
forge create src/StreamPay.sol:StreamPay \
  --rpc-url http://127.0.0.1:8545 \
  --interactive \
  --broadcast
```

Enter the private key of the intended administrator when prompted.
The deploying address becomes the contract administrator.

Copy the address printed after `Deployed to:`.

In `frontend/app.js`, set:

```javascript
const CONTRACT_ADDRESS = "YOUR_DEPLOYED_CONTRACT_ADDRESS";
```

Use the address from your deployment rather than assuming a previous
development address is still valid.

## Start the frontend

In another terminal:

```bash
cd frontend
python3 -m http.server 5500 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:5500/
```

Connect MetaMask and verify that the page shows the intended wallet
address and chain ID 31337.

The frontend loads Ethers.js from a CDN, so internet access is
required for that dependency.

## Demonstration workflow

1. Connect the employer wallet and register a company.
2. Register the employee's public wallet address.
3. Create a stream with a positive ETH deposit and duration greater
   than 15 seconds.
4. Connect the employee wallet and select the incoming stream.
5. Observe the salary counter and progress bar.
6. Withdraw part of the unlocked salary.
7. Cancel an active stream to demonstrate settlement and refund.
8. Connect the administrator wallet and claim accumulated fees.

For example, use a 1 ETH deposit and a 600-second duration to leave
enough time to observe and interact with a stream.

Selecting an account in MetaMask does not always change the account
shared with the website. Always check the Connected address on the page.

## Role display

| Wallet role | Stream lists |
| --- | --- |
| Administrator | All open and closed streams |
| Employer | Outgoing streams |
| Employee | Incoming streams |

The frontend prioritizes the administrator role, then employer, then
employee. A wallet that is both an employer and employee receives the
employer view.

The contract enforces transaction permissions independently of
frontend visibility.

## Account totals

- Employer totals come from stored stream deposits and settlements.
- Employee received salary comes from actual payment events.
- Administrator collected fees are calculated from verified fee
  events and the current unclaimed fee balance.
- The initial Anvil wallet balance is not counted as earnings.
- Gas expenditure is excluded from these totals.

The overview's claimable amount is updated when stream lists refresh.
The selected stream's claimable display estimates progression every
second using the last fetched blockchain timestamp.

The displayed estimate does not transfer ETH automatically.
Transactions settle amounts using blockchain time.

## Restarting the project

Start Anvil again from the project root using the same state path:

```bash
anvil --block-time 1 --chain-id 31337 --state ./local-state/anvil.json --state-interval 10
```

Restart the frontend server in another terminal:

```bash
cd frontend
python3 -m http.server 5500 --bind 127.0.0.1
```

If the saved chain contains the contract, redeployment is unnecessary.

Check the configured contract address with:

```bash
cast code YOUR_DEPLOYED_CONTRACT_ADDRESS \
  --rpc-url http://127.0.0.1:8545
```

A result of `0x` means there is no contract code at that address on
the running chain.

## Limitations

- This is an educational local-development project, not an audited
  production payroll service.
- Company registration records a name and wallet owner; it does not
  verify legal business identity.
- Salary payments use ETH, whose market value can fluctuate.
- Stream lists scan stored stream IDs, which is suitable for a small
  demonstration but would require a more scalable approach for large usage.
- Restored local chain state may not include complete historical logs.
  When payment history does not reconcile with stored settlements,
  the interface marks historical totals unavailable.
- The salary counter is a local estimate between blockchain reads.
- Displayed ETH values are shortened for readability; calculations use wei.

## Author

Nowshin Tabassum

Developed for CSE729 as a corporate micro-salary vesting protocol project.