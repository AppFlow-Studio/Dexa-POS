const fs = require("fs");
const path = require("path");
const filePath = path.join(__dirname, "lib", "mockData.ts");
let content = fs.readFileSync(filePath, "utf-8");

// Step 1: Fix vendor_4 ordering
const idx = content.indexOf('name: "Ocean Seafood Co."');
if (idx >= 0) {
  const before = content.substring(0, idx);
  const after = content.substring(idx);
  const lines = after.split("\n");
  // lines[0] = '    name: "Ocean Seafood Co.",'
  // lines[1] = '    address: null,'
  // lines[2] = '    website: null,'
  // lines[3] = ''
  // lines[4] = '    contactName: "Sarah Wilson",'
  // lines[5] = '    email: "sarah@oceanseafood.com",'
  // lines[6] = '    phone: "555-987-6543",'
  lines[1] = '    contactName: "Sarah Wilson",';
  lines[2] = '    email: "sarah@oceanseafood.com",';
  lines[3] = '    phone: "555-987-6543",';
  lines[4] = '    address: null,';
  lines[5] = '    website: null,';
  lines[6] = '  },';
  content = before + lines.join("\n");
}
console.log("Fixed vendor_4");

// Step 2: Add type to MOCK_FOUND_TERMINALS
content = content.replace(
  "export const MOCK_FOUND_TERMINALS = [",
  "export const MOCK_FOUND_TERMINALS: { id: string; name: string }[] = ["
);

// Step 3: MOCK_EMPLOYEE_SHIFTS -> any[]
content = content.replace(
  "MOCK_EMPLOYEE_SHIFTS: EmployeeShift[]",
  "MOCK_EMPLOYEE_SHIFTS: any[]"
);

// Step 4: MOCK_NOTIFICATIONS -> any[]
content = content.replace(
  "MOCK_NOTIFICATIONS: Notification[]",
  "MOCK_NOTIFICATIONS: any[]"
);

fs.writeFileSync(filePath, content, "utf-8");
console.log("All remaining fixes applied");
