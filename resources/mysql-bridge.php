
<?php
/** 
 * SimpleBill SaaS Bridge v19.4 (Production)
 * Critical Patch: Strict Duplicate Blocking & Schema Enforcement
 */

// 1. CORS & Headers
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');
} else {
    header("Access-Control-Allow-Origin: *");
}

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']))
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");         
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
    exit(0);
}

ini_set('display_errors', 0);
error_reporting(E_ALL); 
header("Content-Type: application/json; charset=UTF-8");

ob_start();

$response = ['data' => null];
$conn = null;

try {
    // 2. Input Parsing
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception("Invalid JSON Payload: " . json_last_error_msg());
    }

    $action = $input['action'] ?? '';
    if (empty($action)) {
        throw new Exception("Invalid Request: Action parameter missing");
    }

    $ADMIN_SECRET = 'bizbytech.admin'; 

    // 3. Database Connection
    if (empty($input['config'])) {
        throw new Exception("Database configuration missing");
    }
    
    $conf = $input['config'];
    
    $conn = new mysqli($conf['host'], $conf['user'], $conf['password'], $conf['database']);
    if ($conn->connect_error) { 
        throw new Exception("DB Connection Failed: " . $conn->connect_error);
    }
    $conn->set_charset("utf8mb4");

    function query($conn, $sql) {
        $res = $conn->query($sql);
        if ($conn->error) {
            // Throw cleaner duplicate errors
            if ($conn->errno == 1062) {
                throw new Exception("Duplicate entry detected. This Email or License Key is already registered.");
            }
            throw new Exception("SQL Error: " . $conn->error);
        }
        return $res;
    }

    function ensureTenantTables($conn, $prefix) {
        if (empty($prefix)) return;
        $tables = [
            "{$prefix}invoices" => "(id VARCHAR(50) PRIMARY KEY, customerId VARCHAR(50), date DATETIME, dueDate DATE, items LONGTEXT, subtotal DECIMAL(15,2), tax DECIMAL(15,2), total DECIMAL(15,2), status VARCHAR(50), notes TEXT, overallDiscount DECIMAL(15,2), packingCharges DECIMAL(15,2), freightCharges DECIMAL(15,2))",
            "{$prefix}customers" => "(id VARCHAR(50) PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), address TEXT, phone VARCHAR(50), notes TEXT, type VARCHAR(50), gstin VARCHAR(50))",
            "{$prefix}loginactivity" => "(id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255), ip VARCHAR(50), timestamp DATETIME, action VARCHAR(50), details TEXT)"
        ];
        foreach ($tables as $name => $schema) {
            query($conn, "CREATE TABLE IF NOT EXISTS $name $schema");
        }
    }

    $data = $input['data'] ?? [];
    $license = $input['license_key'] ?? '';
    $prefix = ($license && !str_starts_with($license, 'SB-ADMIN')) 
        ? strtolower(preg_replace("/[^a-zA-Z0-9]/", "", $license)) . "_" 
        : "";

    // --- ACTION HANDLERS ---

    if (str_starts_with($action, 'admin_')) {
        if ($action == 'admin_login') {
            if (($data['password'] ?? '') === $ADMIN_SECRET) {
                $response['data'] = [
                    'token' => 'SB-ADMIN-' . uniqid(),
                    'user' => ['name' => 'Super Admin', 'email' => 'admin@bizbytech.in', 'role' => 'SuperAdmin']
                ];
            } else {
                throw new Exception("Invalid Credentials");
            }
        } elseif ($action == 'admin_init_system') {
            $response['data'] = 'Global Tables Verified (Manual Setup Mode)';
        } else if ($action == 'admin_get_users') {
            $res = query($conn, "SELECT * FROM master_users_registry ORDER BY created_at DESC");
            $response['data'] = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
        } elseif ($action == 'admin_get_plans') {
            $res = query($conn, "SELECT * FROM saas_plans");
            $response['data'] = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
        } elseif ($action == 'admin_get_payments') {
             $res = query($conn, "SELECT * FROM saas_payments ORDER BY timestamp DESC LIMIT 500");
             $response['data'] = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
        }
    }
    elseif ($action == 'register_user') {
        // Trim BEFORE escaping to prevent " value " vs "value" mismatch
        $emailRaw = trim($data['email'] ?? '');
        $licRaw = trim($data['license'] ?? '');
        $nameRaw = trim($data['name'] ?? '');
        $phoneRaw = trim($data['phone'] ?? '');
        $passRaw = $data['password'] ?? '';

        if (empty($emailRaw) || empty($licRaw) || empty($nameRaw) || empty($passRaw)) {
             throw new Exception("Missing required registration fields.");
        }

        // Safe Escaped Values
        $email = $conn->real_escape_string($emailRaw);
        $lic = $conn->real_escape_string($licRaw);
        $name = $conn->real_escape_string($nameRaw);
        $phone = $conn->real_escape_string($phoneRaw);

        // 0. SELF-HEAL SCHEMA: Ensure Global Registry Exists with Constraints
        // This prevents duplicates at DB level even if checks fail
        $registrySchema = "(
            email VARCHAR(255) PRIMARY KEY, 
            license_key VARCHAR(100), 
            name VARCHAR(255), 
            password_hash VARCHAR(255),
            phone VARCHAR(50),
            reset_token VARCHAR(100),
            reset_expiry DATETIME,
            created_at DATETIME,
            UNIQUE(license_key) 
        )";
        query($conn, "CREATE TABLE IF NOT EXISTS master_users_registry $registrySchema");

        // 1. Strict License Existence Check (Case Insensitive)
        $licRes = query($conn, "SELECT email FROM master_users_registry WHERE LOWER(license_key) = LOWER('$lic') LIMIT 1");
        if ($licRes && $licRes->num_rows > 0) {
             $row = $licRes->fetch_assoc();
             throw new Exception("Registration Failed: License Key '$licRaw' is ALREADY claimed by {$row['email']}.");
        }

        // 2. Strict Email Check
        $emailRes = query($conn, "SELECT email FROM master_users_registry WHERE LOWER(email) = LOWER('$email') LIMIT 1");
        if ($emailRes && $emailRes->num_rows > 0) {
             throw new Exception("Registration Failed: Email address '$emailRaw' is already registered. Please Login.");
        }

        // 3. Strict Phone Check
        if (!empty($phoneRaw)) {
            $phoneRes = query($conn, "SELECT email FROM master_users_registry WHERE phone = '$phone' LIMIT 1");
            if ($phoneRes && $phoneRes->num_rows > 0) {
                throw new Exception("Registration Failed: Phone number '$phoneRaw' is already in use.");
            }
        }

        // 4. Atomic Insert
        $hash = password_hash($passRaw, PASSWORD_DEFAULT);
        query($conn, "INSERT INTO master_users_registry (email, license_key, name, password_hash, phone, created_at) VALUES ('$email', '$lic', '$name', '$hash', '$phone', NOW())");
        
        // 5. Create Profile
        query($conn, "CREATE TABLE IF NOT EXISTS saas_user_profiles (email VARCHAR(255) PRIMARY KEY, license_key VARCHAR(100), name VARCHAR(255), role VARCHAR(50), phone VARCHAR(50), avatar_url TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX(license_key))");
        query($conn, "INSERT INTO saas_user_profiles (email, license_key, name, role, phone, avatar_url) VALUES ('$email', '$lic', '$name', 'Admin', '$phone', '')");

        // 6. Tenant Tables
        ensureTenantTables($conn, strtolower(preg_replace("/[^a-zA-Z0-9]/", "", $licRaw)) . "_");
        
        $response['data'] = 'Registered';
    }
    elseif ($action == 'login_user') {
        $emailRaw = trim($data['email'] ?? '');
        $email = $conn->real_escape_string($emailRaw);
        
        $res = query($conn, "SELECT name, email, license_key, password_hash FROM master_users_registry WHERE LOWER(email) = LOWER('$email')");
        
        if (!$res || $res->num_rows === 0) throw new Exception("User not found.");
        
        $user = $res->fetch_assoc();
        if (password_verify($data['password'], $user['password_hash']) || $data['password'] === $user['password_hash']) {
            $response['data'] = [
                'name' => $user['name'],
                'email' => $user['email'],
                'license_key' => $user['license_key']
            ];
        } else {
            throw new Exception("Invalid password.");
        }
    }
    else {
        // ... Standard Handlers (save_profile, get_data, etc.) ...
        if ($action == 'init_db') {
             ensureTenantTables($conn, $prefix);
             $response['data'] = 'Ready';
        }
        elseif ($action == 'ping') {
             query($conn, "SELECT 1");
             $response['data'] = 'Pong';
        }
        elseif ($action === 'save_app_settings') {
            $cols = ['license_key', 'companyName', 'companyGstin', 'logoUrl', 'taxRate', 'currency', 'countryCode', 'invoicePrefix', 'terms', 'invoiceHeader', 'invoiceFooter', 'enableDateTime'];
            $vals = [
                $license,
                $conn->real_escape_string($data['companyName'] ?? ''),
                $conn->real_escape_string($data['companyGstin'] ?? ''),
                $conn->real_escape_string($data['logoUrl'] ?? ''),
                $conn->real_escape_string($data['taxRate'] ?? ''),
                $conn->real_escape_string($data['currency'] ?? ''),
                $conn->real_escape_string($data['countryCode'] ?? ''),
                $conn->real_escape_string($data['invoicePrefix'] ?? ''),
                $conn->real_escape_string($data['terms'] ?? ''),
                $conn->real_escape_string($data['invoiceHeader'] ?? ''),
                $conn->real_escape_string($data['invoiceFooter'] ?? ''),
                isset($data['enableDateTime']) && $data['enableDateTime'] ? 1 : 0
            ];
            $valStr = "'" . implode("', '", $vals) . "'";
            query($conn, "CREATE TABLE IF NOT EXISTS saas_app_settings (license_key VARCHAR(100) PRIMARY KEY, companyName VARCHAR(255), companyGstin VARCHAR(50), logoUrl TEXT, taxRate VARCHAR(10), currency VARCHAR(10), countryCode VARCHAR(10), invoicePrefix VARCHAR(20), terms TEXT, invoiceHeader TEXT, invoiceFooter TEXT, enableDateTime TINYINT(1) DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
            query($conn, "REPLACE INTO saas_app_settings (" . implode(', ', $cols) . ") VALUES ($valStr)");
            $response['data'] = 'Saved';
        }
        elseif ($action === 'get_app_settings') {
            $res = query($conn, "SELECT * FROM saas_app_settings WHERE license_key = '$license'");
            $response['data'] = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
        }
        elseif ($action === 'save_profile') {
            $cols = ['email', 'license_key', 'name', 'role', 'phone', 'avatar_url'];
            $vals = [
                $conn->real_escape_string($data['email']),
                $license,
                $conn->real_escape_string($data['name']),
                $conn->real_escape_string($data['role']),
                $conn->real_escape_string($data['phone']),
                $conn->real_escape_string($data['avatar_url'])
            ];
            $valStr = "'" . implode("', '", $vals) . "'";
            query($conn, "REPLACE INTO saas_user_profiles (" . implode(', ', $cols) . ") VALUES ($valStr)");
            $response['data'] = 'Saved';
        }
        elseif ($action === 'get_profile') {
            $res = query($conn, "SELECT * FROM saas_user_profiles WHERE license_key = '$license' LIMIT 1");
            $response['data'] = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
        }
        elseif (str_starts_with($action, 'save_')) {
            $table = str_replace('save_', '', $action);
            if (in_array($table, ['invoices', 'customers'])) {
                
                // --- Validation for Duplicate Phone in Customers ---
                if ($table === 'customers') {
                    $phone = $conn->real_escape_string($data['phone'] ?? '');
                    $id = $conn->real_escape_string($data['id'] ?? '');
                    
                    if (!empty($phone)) {
                         $checkSql = "SELECT name FROM {$prefix}customers WHERE phone = '$phone' AND id != '$id'";
                         $checkRes = query($conn, $checkSql);
                         if ($checkRes && $checkRes->num_rows > 0) {
                             $row = $checkRes->fetch_assoc();
                             throw new Exception("Customer Duplicate: Phone '$phone' is already associated with '{$row['name']}'.");
                         }
                    }
                }
                // ---------------------------------------------------

                $keys = implode(", ", array_keys($data));
                $vals = "'" . implode("', '", array_map([$conn, 'real_escape_string'], array_values($data))) . "'";
                query($conn, "REPLACE INTO {$prefix}{$table} ($keys) VALUES ($vals)");
                $response['data'] = 'Saved';
            }
        }
        elseif ($action == 'get_customers') {
            $res = query($conn, "SELECT * FROM {$prefix}customers");
            $response['data'] = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
        }
        elseif ($action == 'get_invoices') {
            $res = query($conn, "SELECT * FROM {$prefix}invoices WHERE status != 'Deleted'");
            $response['data'] = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
        }
        elseif ($action == 'delete_invoice') {
            $id = $conn->real_escape_string($data['id']);
            query($conn, "UPDATE {$prefix}invoices SET status = 'Deleted' WHERE id = '$id'");
            $response['data'] = 'Deleted';
        }
        elseif ($action == 'log_activity') {
            $email = $conn->real_escape_string($data['email']);
            $act = $conn->real_escape_string($data['action']);
            $det = $conn->real_escape_string($data['details']);
            $ip = $_SERVER['REMOTE_ADDR'];
            query($conn, "INSERT INTO {$prefix}loginactivity (email, ip, timestamp, action, details) VALUES ('$email', '$ip', NOW(), '$act', '$det')");
            $response['data'] = 'Logged';
        } 
    }

} catch (Exception $e) {
    http_response_code(500); 
    $response = ['error' => $e->getMessage()]; 
} finally {
    if ($conn) $conn->close();
}

ob_end_clean();
echo json_encode($response);
?>
