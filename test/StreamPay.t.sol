// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StreamPay} from "../src/StreamPay.sol";

contract StreamPayTest is Test {
    StreamPay public streamPay;

    address employer = makeAddr("employer");
    address employee = makeAddr("employee");
    address outsider = makeAddr("outsider");

    receive() external payable {}

    function setUp() public {
        streamPay = new StreamPay();
    }

    function test_AdminIsDeployer() public view {
        assertEq(streamPay.admin(), address(this));
    }

    function test_RegisterCompany() public {
        vm.prank(employer);
        streamPay.registerCompany("Example Ltd");

        uint256 companyId = streamPay.companyIdOf(employer);

        assertEq(companyId, 1);

        (address owner, string memory name) = streamPay.companies(companyId);

        assertEq(owner, employer);
        assertEq(name, "Example Ltd");
        assertEq(streamPay.nextCompanyId(), 2);
    }

    function test_CannotRegisterCompanyTwice() public {
        vm.prank(employer);
        streamPay.registerCompany("Example Ltd");

        vm.expectRevert(bytes("Wallet already has a company"));

        vm.prank(employer);
        streamPay.registerCompany("Another Company");
    }

    function test_StreamUnlocksOverTime() public {
        vm.deal(employer, 10 ether);

        vm.startPrank(employer);

        streamPay.registerCompany("Example Ltd");
        streamPay.registerEmployee(employee);

        uint256 streamId = streamPay.createStream{value: 1 ether}(employee, 100);

        vm.stopPrank();

        uint256 startTime = block.timestamp;

        assertEq(streamId, 1);
        assertEq(address(streamPay).balance, 1 ether);
        assertEq(employer.balance, 9 ether);

        assertEq(streamPay.getUnlockedAmount(streamId), 0);

        vm.warp(startTime + 25);
        assertEq(streamPay.getUnlockedAmount(streamId), 0.25 ether);

        vm.warp(startTime + 50);
        assertEq(streamPay.getUnlockedAmount(streamId), 0.5 ether);

        vm.warp(startTime + 100);
        assertEq(streamPay.getUnlockedAmount(streamId), 1 ether);

        vm.warp(startTime + 150);
        assertEq(streamPay.getUnlockedAmount(streamId), 1 ether);

        assertEq(employee.balance, 0);
        assertEq(address(streamPay).balance, 1 ether);
    }

    function test_PartialWithdrawalAndNoDoubleClaim() public {
        vm.deal(employer, 10 ether);

        vm.startPrank(employer);

        streamPay.registerCompany("Example Ltd");
        streamPay.registerEmployee(employee);

        uint256 streamId = streamPay.createStream{value: 1 ether}(employee, 100);

        vm.stopPrank();

        uint256 startTime = block.timestamp;

        // Half the salary has unlocked.
        vm.warp(startTime + 50);

        vm.prank(employee);
        streamPay.withdraw(streamId);

        assertEq(employee.balance, 0.495 ether);
        assertEq(streamPay.adminFeeBalance(), 0.005 ether);
        assertEq(address(streamPay).balance, 0.505 ether);

        // No additional time has passed, so nothing more is claimable.
        vm.expectRevert(bytes("No salary available"));
        vm.prank(employee);
        streamPay.withdraw(streamId);

        // Another quarter of the salary unlocks.
        vm.warp(startTime + 75);

        vm.prank(employee);
        streamPay.withdraw(streamId);

        assertEq(employee.balance, 0.7425 ether);
        assertEq(streamPay.adminFeeBalance(), 0.0075 ether);
        assertEq(address(streamPay).balance, 0.2575 ether);
    }

    function test_CancellationAfterPartialWithdrawal() public {
        vm.deal(employer, 10 ether);

        vm.startPrank(employer);

        streamPay.registerCompany("Example Ltd");
        streamPay.registerEmployee(employee);

        uint256 streamId = streamPay.createStream{value: 1 ether}(employee, 100);

        vm.stopPrank();

        uint256 startTime = block.timestamp;

        // Employee claims the first 20 seconds of salary.
        vm.warp(startTime + 20);

        vm.prank(employee);
        streamPay.withdraw(streamId);

        assertEq(employee.balance, 0.198 ether);
        assertEq(streamPay.adminFeeBalance(), 0.002 ether);

        // Employer cancels after 50 seconds.
        vm.warp(startTime + 50);

        vm.prank(employer);
        streamPay.cancelStream(streamId);

        assertEq(employee.balance, 0.495 ether);
        assertEq(employer.balance, 9.5 ether);
        assertEq(streamPay.adminFeeBalance(), 0.005 ether);
        assertEq(address(streamPay).balance, 0.005 ether);

        // Cancellation freezes the total earned salary.
        assertEq(streamPay.getUnlockedAmount(streamId), 0.5 ether);

        vm.warp(startTime + 200);

        assertEq(streamPay.getUnlockedAmount(streamId), 0.5 ether);

        // Neither another withdrawal nor another cancellation is allowed.
        vm.expectRevert(bytes("Stream is closed"));
        vm.prank(employee);
        streamPay.withdraw(streamId);

        vm.expectRevert(bytes("Stream is closed"));
        vm.prank(employer);
        streamPay.cancelStream(streamId);
    }

    function test_AdminClaimsFeesAndOthersCannot() public {
        vm.deal(employer, 10 ether);

        vm.startPrank(employer);

        streamPay.registerCompany("Example Ltd");
        streamPay.registerEmployee(employee);

        uint256 streamId = streamPay.createStream{value: 1 ether}(employee, 100);

        vm.stopPrank();

        uint256 startTime = block.timestamp;

        vm.warp(startTime + 50);

        vm.prank(employee);
        streamPay.withdraw(streamId);

        assertEq(streamPay.adminFeeBalance(), 0.005 ether);
        assertEq(address(streamPay).balance, 0.505 ether);

        // The employee is not the admin.
        vm.expectRevert(bytes("Only admin can claim fees"));
        vm.prank(employee);
        streamPay.claimAdminFees();

        // The rejected attempt must not change the balances.
        assertEq(streamPay.adminFeeBalance(), 0.005 ether);
        assertEq(address(streamPay).balance, 0.505 ether);

        uint256 adminBalanceBefore = address(this).balance;

        // No prank: the caller is this test contract, the admin.
        streamPay.claimAdminFees();

        assertEq(address(this).balance, adminBalanceBefore + 0.005 ether);

        assertEq(streamPay.adminFeeBalance(), 0);
        assertEq(address(streamPay).balance, 0.5 ether);

        // The same fees cannot be claimed again.
        vm.expectRevert(bytes("No fees available"));
        streamPay.claimAdminFees();

        // The employee can still collect the remaining salary.
        vm.warp(startTime + 100);

        vm.prank(employee);
        streamPay.withdraw(streamId);

        assertEq(employee.balance, 0.99 ether);
        assertEq(streamPay.adminFeeBalance(), 0.005 ether);
        assertEq(address(streamPay).balance, 0.005 ether);
    }

    function test_RejectsInvalidStreamCreation() public {
        vm.deal(employer, 10 ether);

        vm.startPrank(employer);

        streamPay.registerCompany("Example Ltd");

        // The employee has not been registered yet.
        vm.expectRevert(bytes("Employee not registered under your company"));
        streamPay.createStream{value: 1 ether}(employee, 100);

        streamPay.registerEmployee(employee);

        // No ETH is attached.
        vm.expectRevert(bytes("Deposit must be greater than zero"));
        streamPay.createStream(employee, 100);

        // Exactly 15 seconds is not allowed.
        vm.expectRevert(bytes("Duration must exceed 15 seconds"));
        streamPay.createStream{value: 1 ether}(employee, 15);

        // Failed calls must not keep deposits or consume stream IDs.
        assertEq(address(streamPay).balance, 0);
        assertEq(employer.balance, 10 ether);
        assertEq(streamPay.nextStreamId(), 1);

        // The smallest allowed integer duration is 16 seconds.
        uint256 streamId = streamPay.createStream{value: 1 ether}(employee, 16);

        vm.stopPrank();

        assertEq(streamId, 1);
        assertEq(address(streamPay).balance, 1 ether);
        assertEq(employer.balance, 9 ether);
    }

    function test_OutsiderCannotWithdrawOrCancel() public {
        vm.deal(employer, 10 ether);

        vm.startPrank(employer);

        streamPay.registerCompany("Example Ltd");
        streamPay.registerEmployee(employee);

        uint256 streamId = streamPay.createStream{value: 1 ether}(employee, 100);

        vm.stopPrank();

        vm.warp(block.timestamp + 50);

        vm.expectRevert(bytes("Only the employee can withdraw"));
        vm.prank(outsider);
        streamPay.withdraw(streamId);

        vm.expectRevert(bytes("Only employer or employee can cancel"));
        vm.prank(outsider);
        streamPay.cancelStream(streamId);

        assertEq(outsider.balance, 0);
        assertEq(address(streamPay).balance, 1 ether);
        assertEq(streamPay.adminFeeBalance(), 0);

        // The legitimate employee can still withdraw.
        vm.prank(employee);
        streamPay.withdraw(streamId);

        assertEq(employee.balance, 0.495 ether);
        assertEq(streamPay.adminFeeBalance(), 0.005 ether);
    }

    function test_EmployeeCanCancel() public {
        vm.deal(employer, 10 ether);

        vm.startPrank(employer);

        streamPay.registerCompany("Example Ltd");
        streamPay.registerEmployee(employee);

        uint256 streamId = streamPay.createStream{value: 1 ether}(employee, 100);

        vm.stopPrank();

        uint256 startTime = block.timestamp;

        vm.warp(startTime + 40);

        // This time, the employee requests cancellation.
        vm.prank(employee);
        streamPay.cancelStream(streamId);

        assertEq(employee.balance, 0.396 ether);
        assertEq(employer.balance, 9.6 ether);
        assertEq(streamPay.adminFeeBalance(), 0.004 ether);
        assertEq(address(streamPay).balance, 0.004 ether);

        // Earned salary must remain frozen after cancellation.
        vm.warp(startTime + 200);

        assertEq(streamPay.getUnlockedAmount(streamId), 0.4 ether);

        vm.expectRevert(bytes("Stream is closed"));
        vm.prank(employee);
        streamPay.withdraw(streamId);
    }

    function test_FailedPaymentRollsBack() public {
        TestSalaryRecipient recipient = new TestSalaryRecipient(streamPay);

        vm.deal(employer, 10 ether);
        vm.startPrank(employer);

        streamPay.registerCompany("Example Ltd");
        streamPay.registerEmployee(address(recipient));

        uint256 streamId = streamPay.createStream{value: 1 ether}(address(recipient), 100);

        vm.stopPrank();

        vm.warp(block.timestamp + 50);

        recipient.configure(streamId, true, false);

        vm.expectRevert(bytes("ETH transfer failed"));
        recipient.claim();

        assertEq(address(recipient).balance, 0);
        assertEq(address(streamPay).balance, 1 ether);
        assertEq(streamPay.adminFeeBalance(), 0);

        // Accept payment and retry at the same timestamp.
        recipient.configure(streamId, false, false);
        recipient.claim();

        assertEq(address(recipient).balance, 0.495 ether);
        assertEq(streamPay.adminFeeBalance(), 0.005 ether);
        assertEq(address(streamPay).balance, 0.505 ether);
    }

    function test_ReentrantWithdrawalIsBlocked() public {
        TestSalaryRecipient recipient = new TestSalaryRecipient(streamPay);

        vm.deal(employer, 10 ether);
        vm.startPrank(employer);

        streamPay.registerCompany("Example Ltd");
        streamPay.registerEmployee(address(recipient));

        uint256 streamId = streamPay.createStream{value: 1 ether}(address(recipient), 100);

        vm.stopPrank();

        vm.warp(block.timestamp + 50);

        recipient.configure(streamId, false, true);

        vm.expectCall(address(streamPay), abi.encodeWithSignature("withdraw(uint256)", streamId), 2);

        recipient.claim();

        assertTrue(recipient.reentryAttempted());
        assertFalse(recipient.reentrySucceeded());

        assertEq(address(recipient).balance, 0.495 ether);
        assertEq(streamPay.adminFeeBalance(), 0.005 ether);
        assertEq(address(streamPay).balance, 0.505 ether);
    }
}

contract TestSalaryRecipient {
    StreamPay public streamPay;
    uint256 public streamId;

    bool public rejectPayment;
    bool public attemptReentry;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(StreamPay target) {
        streamPay = target;
    }

    function configure(uint256 id, bool reject, bool reenter) external {
        streamId = id;
        rejectPayment = reject;
        attemptReentry = reenter;
    }

    function claim() external {
        streamPay.withdraw(streamId);
    }

    receive() external payable {
        require(!rejectPayment, "Recipient rejects ETH");

        if (attemptReentry && !reentryAttempted) {
            reentryAttempted = true;

            try streamPay.withdraw(streamId) {
                reentrySucceeded = true;
            } catch {
                reentrySucceeded = false;
            }
        }
    }
}
