// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract StreamPay {
    address public immutable admin;

    struct Company {
        address owner;
        string name;
    }

    struct Stream {
        uint256 companyId;
        address employer;
        address employee;
        uint256 totalDeposit;
        uint256 startTime;
        uint256 duration;
        uint256 totalWithdrawn;
        bool closed;
    }

    uint256 public nextCompanyId = 1;

    mapping(uint256 => Company) public companies;
    mapping(address => uint256) public companyIdOf;
    mapping(uint256 => mapping(address => bool)) public employees;

    uint256 public nextStreamId = 1;

    mapping(uint256 => Stream) public streams;

    uint256 public adminFeeBalance;
    bool private entered;

    event CompanyRegistered(uint256 indexed companyId, address indexed owner, string name);

    event EmployeeRegistered(uint256 indexed companyId, address indexed employee);

    event StreamCreated(
        uint256 indexed streamId,
        uint256 indexed companyId,
        address indexed employee,
        address employer,
        uint256 totalDeposit,
        uint256 startTime,
        uint256 duration
    );

    event SalaryWithdrawn(
        uint256 indexed streamId, address indexed employee, uint256 grossAmount, uint256 employeeAmount, uint256 fee
    );

    event AdminFeesClaimed(address indexed admin, uint256 amount);

    event StreamCancelled(
        uint256 indexed streamId,
        address indexed cancelledBy,
        uint256 employeeAmount,
        uint256 employerRefund,
        uint256 fee
    );

    modifier nonReentrant() {
        require(!entered, "Reentrant call");

        entered = true;

        _;

        entered = false;
    }

    constructor() {
        admin = msg.sender;
    }

    function registerCompany(string memory name) public {
        require(companyIdOf[msg.sender] == 0, "Wallet already has a company");

        require(bytes(name).length > 0, "Company name is required");

        uint256 companyId = nextCompanyId;

        nextCompanyId = nextCompanyId + 1;

        companies[companyId] = Company({owner: msg.sender, name: name});

        companyIdOf[msg.sender] = companyId;

        emit CompanyRegistered(companyId, msg.sender, name);
    }

    function registerEmployee(address employee) public {
        uint256 companyId = companyIdOf[msg.sender];

        require(companyId != 0, "Register a company first");

        require(employee != address(0), "Invalid employee address");

        require(!employees[companyId][employee], "Employee already registered");

        employees[companyId][employee] = true;

        emit EmployeeRegistered(companyId, employee);
    }

    function createStream(address employee, uint256 duration) public payable returns (uint256) {
        uint256 companyId = companyIdOf[msg.sender];

        require(companyId != 0, "Register a company first");

        require(employees[companyId][employee], "Employee not registered under your company");

        require(msg.value > 0, "Deposit must be greater than zero");

        require(duration > 15, "Duration must exceed 15 seconds");

        uint256 streamId = nextStreamId;
        nextStreamId = nextStreamId + 1;

        streams[streamId] = Stream({
            companyId: companyId,
            employer: msg.sender,
            employee: employee,
            totalDeposit: msg.value,
            startTime: block.timestamp,
            duration: duration,
            totalWithdrawn: 0,
            closed: false
        });

        emit StreamCreated(streamId, companyId, employee, msg.sender, msg.value, block.timestamp, duration);

        return streamId;
    }

    function getUnlockedAmount(uint256 streamId) public view returns (uint256) {
        require(streamId > 0 && streamId < nextStreamId, "Stream does not exist");

        Stream storage stream = streams[streamId];

        if (stream.closed) {
            return stream.totalWithdrawn;
        }

        if (block.timestamp <= stream.startTime) {
            return 0;
        }

        uint256 elapsed = block.timestamp - stream.startTime;

        if (elapsed >= stream.duration) {
            return stream.totalDeposit;
        }

        return (stream.totalDeposit * elapsed) / stream.duration;
    }

    function withdraw(uint256 streamId) public nonReentrant {
        require(streamId > 0 && streamId < nextStreamId, "Stream does not exist");

        Stream storage stream = streams[streamId];

        require(msg.sender == stream.employee, "Only the employee can withdraw");

        require(!stream.closed, "Stream is closed");

        uint256 unlocked = getUnlockedAmount(streamId);
        uint256 grossAmount = unlocked - stream.totalWithdrawn;

        require(grossAmount > 0, "No salary available");

        uint256 fee = grossAmount / 100;
        uint256 employeeAmount = grossAmount - fee;

        stream.totalWithdrawn = unlocked;
        adminFeeBalance = adminFeeBalance + fee;

        if (unlocked == stream.totalDeposit) {
            stream.closed = true;
        }

        emit SalaryWithdrawn(streamId, stream.employee, grossAmount, employeeAmount, fee);

        (bool success,) = payable(stream.employee).call{value: employeeAmount}("");

        require(success, "ETH transfer failed");
    }

    function claimAdminFees() public nonReentrant {
        require(msg.sender == admin, "Only admin can claim fees");

        uint256 amount = adminFeeBalance;

        require(amount > 0, "No fees available");

        adminFeeBalance = 0;

        emit AdminFeesClaimed(admin, amount);

        (bool success,) = payable(admin).call{value: amount}("");

        require(success, "Admin fee transfer failed");
    }

    function cancelStream(uint256 streamId) public nonReentrant {
        require(streamId > 0 && streamId < nextStreamId, "Stream does not exist");

        Stream storage stream = streams[streamId];

        require(msg.sender == stream.employer || msg.sender == stream.employee, "Only employer or employee can cancel");

        require(!stream.closed, "Stream is closed");

        uint256 unlocked = getUnlockedAmount(streamId);
        uint256 grossAmount = unlocked - stream.totalWithdrawn;

        uint256 fee = grossAmount / 100;
        uint256 employeeAmount = grossAmount - fee;
        uint256 employerRefund = stream.totalDeposit - unlocked;

        stream.totalWithdrawn = unlocked;
        stream.closed = true;
        adminFeeBalance = adminFeeBalance + fee;

        emit StreamCancelled(streamId, msg.sender, employeeAmount, employerRefund, fee);

        if (employeeAmount > 0) {
            (bool employeePaid,) = payable(stream.employee).call{value: employeeAmount}("");

            require(employeePaid, "Employee payment failed");
        }

        if (employerRefund > 0) {
            (bool employerPaid,) = payable(stream.employer).call{value: employerRefund}("");

            require(employerPaid, "Employer refund failed");
        }
    }
}
