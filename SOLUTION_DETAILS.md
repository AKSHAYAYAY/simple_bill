
# Solution Architecture & Details

## 1. Architecture Overview
SimpleBill follows a **Client-Serverless** architecture. 
- **Frontend:** A Single Page Application (SPA) built with React.
- **Backend:** There is no dedicated API server. The browser communicates directly with Google APIs using the Google API Client Library (`gapi`).
- **Database:** A Google Spreadsheet acts as the relational database.

### Data Flow
`React Components` <-> `DataService` <-> `GAPI Client` <-> `Google Sheets API`

## 2. Data Model (Google Sheets)
The application maps JavaScript objects to 2D arrays (rows) in Google Sheets.

### Customers Sheet (`Customers!A:G`)
| Index | Column | Type | Description |
| :--- | :--- | :--- | :--- |
| 0 | ID | String | Unique Timestamp-based ID |
| 1 | Name | String | Customer or Company Name |
| 2 | Email | String | Contact Email |
| 3 | Address | String | Billing Address |
| 4 | Phone | String | Contact Number |
| 5 | Notes | String | Internal Notes |
| 6 | Type | String | 'Retail' or 'Business' |

### Invoices Sheet (`Invoices!A:J`)
| Index | Column | Type | Description |
| :--- | :--- | :--- | :--- |
| 0 | ID | String | Invoice Number |
| 1 | CustomerID | String | Foreign Key to Customers |
| 2 | Date | Date (ISO) | Issue Date |
| 3 | DueDate | Date (ISO) | Payment Due Date |
| 4 | Items | JSON String | Serialized Array of Invoice Items |
| 5 | Subtotal | Number | Sum of items before tax |
| 6 | Tax | Number | Total tax calculated |
| 7 | Total | Number | Grand Total |
| 8 | Status | String | 'Draft', 'Sent', 'Paid', 'Overdue', 'Deleted' |
| 9 | Notes | String | Invoice specific notes |

*Note: The `Items` column stores the line items (description, qty, price, tax) as a stringified JSON object to avoid complex relational mapping within a flat spreadsheet.*

## 3. Key Components

### Authentication (`services/dataService.ts`)
Authentication is handled via `google.accounts.oauth2`.
1. **initTokenClient**: Requests an Access Token with scope `https://www.googleapis.com/auth/spreadsheets`.
2. **Persistence**: The app relies on the browser session. Session expiry handling is manual (re-login required on token expiry).

### PDF Generation (`components/InvoicePDF.tsx`)
We utilize the browser's native `window.print()` functionality combined with CSS `@media print` rules.
- When "Print" is clicked, the UI switches to a clean view hiding sidebars and buttons.
- The `InvoicePDF` component renders a standard invoice layout.
- We deliberately avoided heavy PDF libraries (like jsPDF) to keep the bundle size small and allow for easy HTML/CSS styling updates.

### Reporting (`pages/Reports.tsx`)
- **Logic**: Financial Year (FY) calculation is dynamic based on the selected Country in Settings.
- **Visualization**: Uses `Recharts` to render monthly breakdowns.
- **Performance**: Metrics are calculated client-side by iterating over the fetched invoice array.

### Error Logging (`services/logger.ts`)
To make the application production-ready, a custom `Logger` service captures:
- **API Errors:** Failed calls to Google Sheets/Drive.
- **App Crashes:** Unhandled promise rejections and global errors.
- **Info Events:** Successful connections and saves.

Logs are stored in `localStorage` (Last 100 entries) and can be viewed or exported from the Settings page.

## 4. Settings & State Management
- **Persistence**: Application settings (API keys, company info, logo) are stored in the browser's `localStorage`. This ensures that sensitive API keys are not hardcoded in the source code but persist across reloads for the user.
- **Global State**: Managed via React `useState` in `App.tsx` and passed down via props.

## 5. Security Considerations
- **API Keys**: The Google API Key is stored in LocalStorage. In a production environment, users enter their own keys, meaning the developer does not host credentials.
- **OAuth**: The application uses Client-side OAuth. The access token is held in memory.
- **Data Access**: The app only requests access to Spreadsheets. It does not read emails or Drive files outside of the scope.

## 6. Known Limitations
- **Concurrency**: Google Sheets is not a transactional database. Simultaneous writes from multiple users *might* cause conflicts (though `append` is generally safe).
- **Scalability**: Performance relies on loading the full dataset into the browser. It works well for thousands of records but is not suitable for millions.
- **Soft Delete**: Deleting an invoice sets the status to 'Deleted' but keeps the row in the sheet to preserve data integrity.
