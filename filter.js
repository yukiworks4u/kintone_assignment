// Assume you have your App ID
const appId = 13; // Replace with your actual App ID

// Define your query conditions and sorting
const query = 'Status in ("販売: 商品配達完了 (Sales: Delivered)", "購入: 購入完了 (Purchase: Closed/Paid)") order by order_id asc limit 100 offset 0';
// - Status = "Pending": Filters for orders with the status "販売: 商品配達完了 (Sales: Delivered)".
// - order by order_id asc: Sorts the results by the "OrderDate" field in descending order (newest first).
// - limit 100: Retrieves a maximum of 100 records.
// - offset 0: Starts retrieving records from the beginning.

// Define the fields you want to retrieve
const fields = ['order_id','order_type', 'contact_lookup', 'item_lookup', 'item_name', 'quantity', 'Status']; // Replace with your actual field codes

// Construct the parameters for the API call
const params = {
  app: appId,
  query: query,
  fields: fields,
  totalCount: true // Optional: to get the total number of records matching the query
};

// Make the API call to get records
kintone.api(kintone.api.url('/k/v1/records', true), 'GET', params, (resp) => {
  // Success
  console.log(`Successfully retrieved ${resp.records.length} records.`);
  if (resp.totalCount) {
    console.log(`Total matching records in Kintone: ${resp.totalCount}`);
  }

  if (resp.records.length > 0) {
    console.log("Filtered and Sorted Order History:");
    resp.records.forEach((record) => {
      console.log("------------------------------------");
      fields.forEach((field) => {
        // Access the field value. Note: Field codes might differ in your app.
        // The 'value' property holds the actual data for each field.
        if (record[field]) {
          console.log(`${field}: ${record[field].value}`);
        } else {
          console.log(`${field}: (No data)`);
        }
      });
    });
    console.log("------------------------------------");
  } else {
    console.log("No records found matching your criteria.");
  }
}, (error) => {
  // Error
  console.error("Error retrieving records from Kintone:", error);
});
