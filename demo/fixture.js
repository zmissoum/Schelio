/* Demo org — a realistic mocked Salesforce org used to record product videos
   (demo/record.js) and runnable by anyone without credentials. */
'use strict';

const F = (name, label, type, extra = {}) => Object.assign({
  name, label, type, nillable: true, custom: /__c$/.test(name), deprecatedAndHidden: false,
  inlineHelpText: null, length: type === 'string' ? 255 : 0, picklistValues: [], calculated: false, externalId: false, unique: false
}, extra);
const PL = (name, label, values, extra = {}) => F(name, label, 'picklist', Object.assign({ picklistValues: values.map(v => ({ value: v, label: v, active: true })) }, extra));
const REF = (name, label, to, rel, extra = {}) => F(name, label, 'reference', Object.assign({ referenceTo: [to], relationshipName: rel }, extra));
const RT = (name, id, extra = {}) => Object.assign({ name, developerName: name.replace(/\s+/g, '_'), recordTypeId: id, master: false, active: true, defaultRecordTypeMapping: false }, extra);
const MASTER = { name: 'Master', developerName: 'Master', recordTypeId: '012000000000000AAA', master: true, active: true, defaultRecordTypeMapping: true };
const SYS = (prefix) => [F('Id', prefix + ' ID', 'id'), REF('OwnerId', 'Owner', 'User', 'Owner', { nillable: false }), REF('CreatedById', 'Created By', 'User', 'CreatedBy'), REF('LastModifiedById', 'Last Modified By', 'User', 'LastModifiedBy'), F('CreatedDate', 'Created Date', 'datetime'), F('LastModifiedDate', 'Last Modified Date', 'datetime')];

const ORG = {};
function obj(def) { ORG[def.name] = Object.assign({ queryable: true, searchable: true, childRelationships: [], recordTypeInfos: [MASTER], custom: /__c$/.test(def.name) }, def); }

obj({ name: 'Account', label: 'Account', labelPlural: 'Accounts', keyPrefix: '001',
  recordTypeInfos: [MASTER, RT('Customer', '012C', { defaultRecordTypeMapping: true }), RT('Partner', '012P'), RT('Legacy Reseller', '012L', { active: false })],
  fields: SYS('Account').concat([
    F('Name', 'Account Name', 'string', { nillable: false }), F('AccountNumber', 'Account Number', 'string', { length: 40 }),
    PL('Type', 'Type', ['Prospect', 'Customer - Direct', 'Customer - Channel', 'Partner', 'Other']),
    PL('Industry', 'Industry', ['Agriculture', 'Banking', 'Biotechnology', 'Consulting', 'Education', 'Energy', 'Finance', 'Healthcare', 'Insurance', 'Manufacturing', 'Media', 'Retail', 'Technology', 'Telecommunications', 'Transportation']),
    PL('Rating', 'Rating', ['Hot', 'Warm', 'Cold']), PL('Ownership', 'Ownership', ['Public', 'Private', 'Subsidiary', 'Other']),
    F('Phone', 'Account Phone', 'phone'), F('Fax', 'Account Fax', 'phone'), F('Website', 'Website', 'url'),
    F('AnnualRevenue', 'Annual Revenue', 'currency'), F('NumberOfEmployees', 'Employees', 'int'), F('Description', 'Account Description', 'textarea'), F('Site', 'Account Site', 'string', { length: 80 }),
    F('BillingStreet', 'Billing Street', 'textarea'), F('BillingCity', 'Billing City', 'string', { length: 40 }), F('BillingState', 'Billing State/Province', 'string', { length: 80 }), F('BillingPostalCode', 'Billing Zip/Postal Code', 'string', { length: 20 }), F('BillingCountry', 'Billing Country', 'string', { length: 80 }),
    F('ShippingCity', 'Shipping City', 'string', { length: 40 }), F('ShippingCountry', 'Shipping Country', 'string', { length: 80 }),
    REF('ParentId', 'Parent Account', 'Account', 'Parent'),
    PL('Customer_Segment__c', 'Customer Segment', ['Enterprise', 'Mid-Market', 'SMB', 'Startup']), F('SLA_Expiration_Date__c', 'SLA Expiration Date', 'date'), PL('SLA__c', 'SLA', ['Gold', 'Silver', 'Bronze']),
    F('Risk_Score__c', 'Risk Score', 'double', { calculated: true }), F('Health_Score__c', 'Health Score', 'double'), F('Credit_Limit__c', 'Credit Limit', 'currency'),
    F('ERP_Id__c', 'ERP ID', 'string', { externalId: true, unique: false, length: 30 }), F('Key_Account__c', 'Key Account', 'boolean'), F('Account_Manager_Notes__c', 'Notes', 'textarea'),
    F('Legacy_Rating__c', 'Rating', 'string'), F('Last_Review_Date__c', 'Last Review Date', 'date'), F('Churn_Risk__c', 'Churn Risk', 'percent'), F('Primary_Contact_Email__c', 'Primary Contact Email', 'email'),
    REF('Primary_Contact__c', 'Primary Contact', 'Contact', 'Primary_Contact__r')
  ]),
  childRelationships: [
    { childSObject: 'Contact', field: 'AccountId', relationshipName: 'Contacts' }, { childSObject: 'Opportunity', field: 'AccountId', relationshipName: 'Opportunities' },
    { childSObject: 'Case', field: 'AccountId', relationshipName: 'Cases' }, { childSObject: 'Account', field: 'ParentId', relationshipName: 'ChildAccounts' },
    { childSObject: 'Invoice__c', field: 'Account__c', relationshipName: 'Invoices__r', cascadeDelete: true }, { childSObject: 'Project__c', field: 'Account__c', relationshipName: 'Projects__r' },
    { childSObject: 'Subscription__c', field: 'Account__c', relationshipName: 'Subscriptions__r' }, { childSObject: 'Lead', field: 'ConvertedAccountId', relationshipName: 'ConvertedLeads' }
  ] });

obj({ name: 'Contact', label: 'Contact', labelPlural: 'Contacts', keyPrefix: '003',
  fields: SYS('Contact').concat([
    REF('AccountId', 'Account Name', 'Account', 'Account'), F('FirstName', 'First Name', 'string', { length: 40 }), F('LastName', 'Last Name', 'string', { nillable: false, length: 80 }),
    PL('Salutation', 'Salutation', ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.']), F('Title', 'Title', 'string', { length: 128 }), F('Department', 'Department', 'string', { length: 80 }),
    F('Email', 'Email', 'email'), F('Phone', 'Business Phone', 'phone'), F('MobilePhone', 'Mobile Phone', 'phone'), F('Birthdate', 'Birthdate', 'date'),
    PL('LeadSource', 'Lead Source', ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other']), F('MailingCity', 'Mailing City', 'string', { length: 40 }), F('MailingCountry', 'Mailing Country', 'string', { length: 80 }),
    F('HasOptedOutOfEmail', 'Email Opt Out', 'boolean'), REF('ReportsToId', 'Reports To', 'Contact', 'ReportsTo'), F('Description', 'Contact Description', 'textarea'),
    PL('Preferred_Language__c', 'Preferred Language', ['English', 'French', 'German', 'Spanish']), F('Newsletter__c', 'Newsletter Subscriber', 'boolean'), F('NPS_Score__c', 'NPS Score', 'int'), F('LinkedIn_URL__c', 'LinkedIn', 'url')
  ]),
  childRelationships: [{ childSObject: 'Case', field: 'ContactId', relationshipName: 'Cases' }, { childSObject: 'Project__c', field: 'Project_Manager__c', relationshipName: 'Managed_Projects__r' }, { childSObject: 'Contact', field: 'ReportsToId', relationshipName: 'DirectReports' }] });

obj({ name: 'Opportunity', label: 'Opportunity', labelPlural: 'Opportunities', keyPrefix: '006',
  recordTypeInfos: [MASTER, RT('New Business', '012N', { defaultRecordTypeMapping: true }), RT('Renewal', '012R')],
  fields: SYS('Opportunity').concat([
    REF('AccountId', 'Account Name', 'Account', 'Account'), F('Name', 'Name', 'string', { nillable: false, length: 120 }),
    PL('StageName', 'Stage', ['Prospecting', 'Qualification', 'Needs Analysis', 'Value Proposition', 'Proposal/Price Quote', 'Negotiation/Review', 'Closed Won', 'Closed Lost'], { nillable: false }),
    F('Amount', 'Amount', 'currency'), F('Probability', 'Probability (%)', 'percent'), F('CloseDate', 'Close Date', 'date', { nillable: false }), PL('Type', 'Type', ['Existing Customer - Upgrade', 'Existing Customer - Replacement', 'New Customer']),
    PL('LeadSource', 'Lead Source', ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other']), F('NextStep', 'Next Step', 'string', { length: 255 }), F('Description', 'Description', 'textarea'), F('IsClosed', 'Closed', 'boolean'), F('IsWon', 'Won', 'boolean'),
    REF('CampaignId', 'Primary Campaign Source', 'Campaign', 'Campaign'), REF('Pricebook2Id', 'Price Book', 'Pricebook2', 'Pricebook2'), REF('ContractId', 'Contract', 'Contract', 'Contract'),
    F('Expected_Margin__c', 'Expected Margin', 'percent', { calculated: true }), F('Renewal_Date__c', 'Renewal Date', 'date'), PL('Competitor__c', 'Main Competitor', ['None', 'Acme', 'Globex', 'Initech']), F('Deal_Score__c', 'Deal Score', 'double', { calculated: true })
  ]),
  childRelationships: [{ childSObject: 'OpportunityLineItem', field: 'OpportunityId', relationshipName: 'OpportunityLineItems', cascadeDelete: true }, { childSObject: 'Invoice__c', field: 'Opportunity__c', relationshipName: 'Invoices__r' }] });

obj({ name: 'Case', label: 'Case', labelPlural: 'Cases', keyPrefix: '500',
  recordTypeInfos: [MASTER, RT('Support', '012S', { defaultRecordTypeMapping: true }), RT('Billing', '012B')],
  fields: SYS('Case').concat([
    F('CaseNumber', 'Case Number', 'string', { length: 30 }), REF('AccountId', 'Account Name', 'Account', 'Account'), REF('ContactId', 'Contact Name', 'Contact', 'Contact'), REF('ParentId', 'Parent Case', 'Case', 'Parent'),
    F('Subject', 'Subject', 'string', { length: 255 }), F('Description', 'Description', 'textarea'), PL('Status', 'Status', ['New', 'Working', 'Escalated', 'Closed'], { nillable: false }),
    PL('Priority', 'Priority', ['High', 'Medium', 'Low']), PL('Origin', 'Case Origin', ['Phone', 'Email', 'Web', 'Chat']), PL('Type', 'Type', ['Mechanical', 'Electrical', 'Electronic', 'Structural', 'Other']), PL('Reason', 'Case Reason', ['Installation', 'Equipment Complexity', 'Performance', 'Breakdown', 'Feedback', 'Other']),
    F('IsEscalated', 'Escalated', 'boolean'), F('ClosedDate', 'Closed Date', 'datetime'), F('SLA_Breached__c', 'SLA Breached', 'boolean', { calculated: true }), F('Resolution_Time_Hours__c', 'Resolution Time (h)', 'double', { calculated: true })
  ]) });

obj({ name: 'Lead', label: 'Lead', labelPlural: 'Leads', keyPrefix: '00Q',
  fields: SYS('Lead').concat([
    F('FirstName', 'First Name', 'string', { length: 40 }), F('LastName', 'Last Name', 'string', { nillable: false, length: 80 }), F('Company', 'Company', 'string', { nillable: false }), F('Title', 'Title', 'string', { length: 128 }),
    F('Email', 'Email', 'email'), F('Phone', 'Phone', 'phone'), PL('Status', 'Lead Status', ['Open - Not Contacted', 'Working - Contacted', 'Closed - Converted', 'Closed - Not Converted'], { nillable: false }),
    PL('Rating', 'Rating', ['Hot', 'Warm', 'Cold']), PL('Industry', 'Industry', ['Banking', 'Healthcare', 'Technology', 'Retail', 'Other']), PL('LeadSource', 'Lead Source', ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other']),
    F('AnnualRevenue', 'Annual Revenue', 'currency'), F('NumberOfEmployees', 'No. of Employees', 'int'), F('IsConverted', 'Converted', 'boolean'), REF('ConvertedAccountId', 'Converted Account', 'Account', 'ConvertedAccount'), REF('ConvertedContactId', 'Converted Contact', 'Contact', 'ConvertedContact'), REF('ConvertedOpportunityId', 'Converted Opportunity', 'Opportunity', 'ConvertedOpportunity'),
    F('Lead_Score__c', 'Lead Score', 'int'), F('Website_Visits__c', 'Website Visits', 'int')
  ]) });

obj({ name: 'Product2', label: 'Product', labelPlural: 'Products', keyPrefix: '01t',
  fields: [F('Id', 'Product ID', 'id'), F('Name', 'Product Name', 'string', { nillable: false }), F('ProductCode', 'Product Code', 'string', { length: 255 }), F('Description', 'Product Description', 'textarea'), F('IsActive', 'Active', 'boolean'),
    PL('Family', 'Product Family', ['Hardware', 'Software', 'Services', 'Subscription']), F('QuantityUnitOfMeasure', 'Quantity Unit Of Measure', 'string', { length: 40 }), F('StockKeepingUnit', 'SKU', 'string', { length: 180 }), F('Unit_Cost__c', 'Unit Cost', 'currency'), F('Warranty_Months__c', 'Warranty (months)', 'int'),
    REF('CreatedById', 'Created By', 'User', 'CreatedBy'), REF('LastModifiedById', 'Last Modified By', 'User', 'LastModifiedBy')],
  childRelationships: [{ childSObject: 'OpportunityLineItem', field: 'Product2Id', relationshipName: 'OpportunityLineItems' }, { childSObject: 'Invoice_Line__c', field: 'Product__c', relationshipName: 'Invoice_Lines__r' }] });

obj({ name: 'OpportunityLineItem', label: 'Opportunity Product', labelPlural: 'Opportunity Products', keyPrefix: '00k',
  fields: [F('Id', 'Line Item ID', 'id'), REF('OpportunityId', 'Opportunity', 'Opportunity', 'Opportunity', { nillable: false, cascadeDelete: true }), REF('Product2Id', 'Product', 'Product2', 'Product2'), REF('PricebookEntryId', 'Price Book Entry', 'PricebookEntry', 'PricebookEntry'),
    F('Quantity', 'Quantity', 'double', { nillable: false }), F('UnitPrice', 'Sales Price', 'currency'), F('TotalPrice', 'Total Price', 'currency'), F('ListPrice', 'List Price', 'currency'), F('Discount', 'Discount', 'percent'), F('ServiceDate', 'Date', 'date'), F('Description', 'Line Description', 'string', { length: 255 }),
    REF('CreatedById', 'Created By', 'User', 'CreatedBy')] });

obj({ name: 'User', label: 'User', labelPlural: 'Users', keyPrefix: '005',
  fields: [F('Id', 'User ID', 'id'), F('Username', 'Username', 'string', { nillable: false, length: 80 }), F('FirstName', 'First Name', 'string', { length: 40 }), F('LastName', 'Last Name', 'string', { nillable: false, length: 80 }), F('Email', 'Email', 'email', { nillable: false }), F('Alias', 'Alias', 'string', { nillable: false, length: 8 }), F('IsActive', 'Active', 'boolean'), F('Title', 'Title', 'string', { length: 80 }), F('Department', 'Department', 'string', { length: 80 }),
    REF('ProfileId', 'Profile', 'Profile', 'Profile', { nillable: false }), REF('UserRoleId', 'Role', 'UserRole', 'UserRole'), REF('ManagerId', 'Manager', 'User', 'Manager'), F('TimeZoneSidKey', 'Time Zone', 'picklist', { nillable: false }), F('LanguageLocaleKey', 'Language', 'picklist', { nillable: false })],
  childRelationships: [{ childSObject: 'User', field: 'ManagerId', relationshipName: 'ManagedUsers' }] });

obj({ name: 'Invoice__c', label: 'Invoice', labelPlural: 'Invoices', keyPrefix: 'a0A',
  recordTypeInfos: [MASTER, RT('Standard', '012I', { defaultRecordTypeMapping: true }), RT('Credit Note', '012K')],
  fields: SYS('Invoice').concat([
    F('Name', 'Invoice Number', 'string', { nillable: false, length: 80 }), REF('Account__c', 'Account', 'Account', 'Account__r', { nillable: false, cascadeDelete: true }), REF('Opportunity__c', 'Opportunity', 'Opportunity', 'Opportunity__r'), REF('Contact__c', 'Billing Contact', 'Contact', 'Contact__r'),
    PL('Status__c', 'Status', ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled']), F('Issue_Date__c', 'Issue Date', 'date', { nillable: false }), F('Due_Date__c', 'Due Date', 'date'), F('Paid_Date__c', 'Paid Date', 'date'),
    F('Subtotal__c', 'Subtotal', 'currency', { calculated: true }), F('Tax_Amount__c', 'Tax Amount', 'currency', { calculated: true }), F('Total__c', 'Total', 'currency', { calculated: true }), F('Amount_Paid__c', 'Amount Paid', 'currency'), F('Balance_Due__c', 'Balance Due', 'currency', { calculated: true }),
    PL('Payment_Terms__c', 'Payment Terms', ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on receipt']), PL('Currency__c', 'Currency', ['EUR', 'USD', 'GBP', 'CHF']), F('PO_Number__c', 'PO Number', 'string'), F('Notes__c', 'Notes', 'textarea'),
    F('ERP_Invoice_Id__c', 'ERP Invoice ID', 'string', { externalId: true, unique: true, length: 40 }), F('Is_Disputed__c', 'Disputed', 'boolean'), F('Dispute_Reason__c', 'Dispute Reason', 'textarea'), F('Days_Overdue__c', 'Days Overdue', 'double', { calculated: true }), F('Reminder_Count__c', 'Reminders Sent', 'int')
  ]),
  childRelationships: [{ childSObject: 'Invoice_Line__c', field: 'Invoice__c', relationshipName: 'Invoice_Lines__r', cascadeDelete: true }] });

obj({ name: 'Invoice_Line__c', label: 'Invoice Line', labelPlural: 'Invoice Lines', keyPrefix: 'a0B',
  fields: SYS('Invoice Line').concat([
    F('Name', 'Line Number', 'string', { nillable: false, length: 80 }), REF('Invoice__c', 'Invoice', 'Invoice__c', 'Invoice__r', { nillable: false, cascadeDelete: true }), REF('Product__c', 'Product', 'Product2', 'Product__r'),
    F('Quantity__c', 'Quantity', 'double', { nillable: false }), F('Unit_Price__c', 'Unit Price', 'currency', { nillable: false }), F('Discount__c', 'Discount', 'percent'), F('Line_Total__c', 'Line Total', 'currency', { calculated: true }), F('Tax_Rate__c', 'Tax Rate', 'percent'), F('Description__c', 'Description', 'string')
  ]) });

obj({ name: 'Project__c', label: 'Project', labelPlural: 'Projects', keyPrefix: 'a0C',
  fields: SYS('Project').concat([
    F('Name', 'Project Name', 'string', { nillable: false, length: 80 }), REF('Account__c', 'Account', 'Account', 'Account__r', { nillable: false }), REF('Project_Manager__c', 'Project Manager', 'Contact', 'Project_Manager__r'), REF('Opportunity__c', 'Source Opportunity', 'Opportunity', 'Opportunity__r'),
    PL('Status__c', 'Status', ['Planned', 'In Progress', 'On Hold', 'Completed', 'Cancelled']), PL('Phase__c', 'Phase', ['Discovery', 'Design', 'Build', 'Test', 'Deploy', 'Hypercare']), F('Start_Date__c', 'Start Date', 'date'), F('End_Date__c', 'End Date', 'date'), F('Budget__c', 'Budget', 'currency'), F('Actual_Cost__c', 'Actual Cost', 'currency'), F('Completion__c', 'Completion', 'percent'), F('Description__c', 'Description', 'textarea'), F('Jira_Key__c', 'Jira Key', 'string', { externalId: true, unique: true, length: 20 })
  ]) });

obj({ name: 'Subscription__c', label: 'Subscription', labelPlural: 'Subscriptions', keyPrefix: 'a0D',
  recordTypeInfos: [MASTER, RT('Monthly', '012M'), RT('Annual', '012A', { active: false })],
  fields: SYS('Subscription').concat([
    F('Name', 'Subscription Name', 'string', { nillable: false, length: 80 }), REF('Account__c', 'Account', 'Account', 'Account__r', { nillable: false }),
    F('plan_name__c', 'Plan', 'string'), F('plan_tier__c', 'Plan', 'string'), F('Start__c', 'Start', 'date'), F('End__c', 'End', 'date'), F('MRR__c', 'MRR', 'currency'), F('ARR__c', 'ARR', 'currency'), F('Seats__c', 'Seats', 'int'), F('Seats_Used__c', 'Seats', 'int'),
    F('field_01__c', 'Field 01', 'string'), F('field_02__c', 'Field 02', 'string'), F('field_03__c', 'Field 03', 'string'), F('legacy_flag__c', 'Legacy Flag', 'boolean'), F('Ext_Ref__c', 'External Ref', 'string', { externalId: true, unique: false }),
    PL('Country__c', 'Country', Array.from({ length: 212 }, (_, i) => 'Country ' + (i + 1)))
  ]) });

// ── Secondary data ─────────────────────────────────────
const RECORD_COUNT = { Account: 48210, Contact: 131004, Opportunity: 22765, Case: 310998, Lead: 54120, Product2: 1204, OpportunityLineItem: 61330, User: 412, Invoice__c: 18440, Invoice_Line__c: 73902, Project__c: 2310, Subscription__c: 0 };
const OBJECT_DESCRIPTION = { Invoice__c: 'Customer invoice issued from a closed-won opportunity; synchronised nightly with the ERP.', Project__c: '', Subscription__c: '', Invoice_Line__c: 'One billable line of an invoice.' };
const DESCRIBED = { // custom fields WITH a description, per object (others are empty)
  Account: ['Customer_Segment__c', 'SLA__c', 'SLA_Expiration_Date__c', 'Risk_Score__c', 'Health_Score__c', 'Credit_Limit__c', 'ERP_Id__c', 'Key_Account__c', 'Churn_Risk__c'],
  Contact: ['Preferred_Language__c', 'NPS_Score__c'], Opportunity: ['Expected_Margin__c', 'Renewal_Date__c', 'Deal_Score__c', 'Competitor__c'], Case: ['SLA_Breached__c', 'Resolution_Time_Hours__c'], Lead: ['Lead_Score__c'], Product2: ['Unit_Cost__c', 'Warranty_Months__c'],
  Invoice__c: ['Account__c', 'Status__c', 'Total__c', 'ERP_Invoice_Id__c', 'Balance_Due__c'], Invoice_Line__c: ['Invoice__c', 'Product__c', 'Quantity__c', 'Unit_Price__c', 'Line_Total__c', 'Tax_Rate__c', 'Discount__c', 'Description__c'],
  Project__c: ['Account__c', 'Status__c', 'Phase__c', 'Jira_Key__c'], Subscription__c: []
};
const PROFILES = ['System Administrator', 'Sales User', 'Service Agent', 'Finance'];
const CRUD = {
  'System Administrator': [1, 1, 1, 1, 1, 1], 'Sales User': [1, 1, 1, 0, 0, 0], 'Service Agent': [1, 0, 1, 0, 0, 0], 'Finance': [1, 0, 0, 0, 1, 0]
};
const LAYOUTS = o => { const m = ORG[o]; const rts = (m.recordTypeInfos || []).filter(r => !r.master); return [{ Id: '00h' + o.slice(0, 3), Name: m.label + ' Layout' }].concat(rts.map(r => ({ Id: '00h' + r.recordTypeId, Name: r.name + ' ' + m.label + ' Layout' }))); };
const FLEXI = o => { const m = ORG[o]; return [{ Id: '0M0' + o.slice(0, 3), DeveloperName: o.replace(/__c$/, '') + '_Record_Page', MasterLabel: m.label + ' Record Page', Type: 'RecordPage', Description: 'Default Lightning page' }].concat(o === 'Account' ? [{ Id: '0M0ACP', DeveloperName: 'Partner_Account_Page', MasterLabel: 'Partner Account Page', Type: 'RecordPage', Description: 'Assigned to the Partner record type' }] : []); };

const PICKLIST_RT = (o, rtId) => { // picklist values per record type (UI API shape)
  const m = ORG[o]; const out = {};
  m.fields.filter(f => f.type === 'picklist' && f.picklistValues.length).forEach(f => {
    let vals = f.picklistValues.map(v => ({ label: v.label, value: v.value, attributes: null }));
    if (o === 'Account' && rtId === '012P' && f.name === 'Type') vals = vals.filter(v => /Partner|Other/.test(v.value));
    if (o === 'Opportunity' && rtId === '012R' && f.name === 'StageName') vals = vals.filter(v => /Qualification|Proposal|Negotiation|Closed/.test(v.value));
    if (o === 'Opportunity' && rtId === '012R' && f.name === 'Type') vals = vals.filter(v => /Existing/.test(v.value));
    if (o === 'Case' && rtId === '012B' && f.name === 'Reason') vals = vals.filter(v => /Feedback|Other/.test(v.value));
    if (o === 'Invoice__c' && rtId === '012K' && f.name === 'Status__c') vals = vals.filter(v => /Draft|Sent|Paid|Cancelled/.test(v.value));
    if (vals.length) vals[0].attributes = { defaultValue: true };
    out[f.name] = { values: vals };
  });
  return { picklistFieldValues: out };
};

const VALIDATION_RULES = {
  Account: [
    { name: 'Billing_Country_Required_For_Customers', msg: 'Billing country is required for customers.', formula: "AND(ISPICKVAL(Type, 'Customer - Direct'), ISBLANK(BillingCountry))", field: 'BillingCountry', desc: 'Customers must have a billing country for tax.' },
    { name: 'Credit_Limit_Positive', msg: 'Credit limit cannot be negative.', formula: 'Credit_Limit__c < 0', field: 'Credit_Limit__c' },
    { name: 'Legacy_Rating_Lock', msg: 'Legacy rating is read only.', formula: 'ISCHANGED(Legacy_Rating__c)', active: false }
  ],
  Opportunity: [
    { name: 'Close_Date_In_Future', msg: 'Close date must be in the future for open deals.', formula: 'AND(NOT(IsClosed), CloseDate < TODAY())', field: 'CloseDate' },
    { name: 'Amount_Required_Past_Qualification', msg: 'Amount is required from Needs Analysis onwards.', formula: "AND(ISBLANK(Amount), NOT(ISPICKVAL(StageName,'Prospecting')), NOT(ISPICKVAL(StageName,'Qualification')))", field: 'Amount' }
  ],
  Case: [{ name: 'Escalation_Needs_Reason', msg: 'Add a reason before escalating.', formula: 'AND(IsEscalated, ISPICKVAL(Reason, ""))', field: 'Reason' }],
  Invoice__c: [
    { name: 'Due_After_Issue', msg: 'Due date must be after issue date.', formula: 'Due_Date__c < Issue_Date__c', field: 'Due_Date__c' },
    { name: 'Paid_Needs_Paid_Date', msg: 'Paid invoices need a paid date.', formula: "AND(ISPICKVAL(Status__c,'Paid'), ISBLANK(Paid_Date__c))", field: 'Paid_Date__c' },
    { name: 'Dispute_Needs_Reason', msg: 'Explain the dispute.', formula: 'AND(Is_Disputed__c, ISBLANK(Dispute_Reason__c))', field: 'Dispute_Reason__c' }
  ],
  Project__c: [{ name: 'End_After_Start', msg: 'End date must be after start date.', formula: 'End_Date__c < Start_Date__c', field: 'End_Date__c' }]
};
const FLOWS = {
  Account: [{ api: 'Account_Set_Segment', label: 'Account — Set Customer Segment', trigger: 'RecordBeforeSave', desc: 'Derives Customer_Segment__c from revenue and employees.' }, { api: 'Account_Notify_Key_Account_Owner', label: 'Account — Notify Key Account owner', trigger: 'RecordAfterSave' }],
  Opportunity: [{ api: 'Opp_Create_Invoice_On_Closed_Won', label: 'Opportunity — Create invoice on Closed Won', trigger: 'RecordAfterSave', desc: 'Creates an Invoice__c when StageName becomes Closed Won.' }, { api: 'Opp_Stale_Deal_Reminder', label: 'Opportunity — Stale deal reminder', trigger: 'Scheduled', active: false }],
  Case: [{ api: 'Case_Auto_Escalate', label: 'Case — Auto-escalate on SLA breach', trigger: 'RecordAfterSave' }],
  Invoice__c: [{ api: 'Invoice_Overdue_Reminder', label: 'Invoice — Overdue reminder', trigger: 'Scheduled' }, { api: 'Invoice_Sync_To_ERP', label: 'Invoice — Sync to ERP', trigger: 'RecordAfterSave', desc: 'Platform event to the ERP integration.' }]
};
const TRIGGERS = {
  Account: [{ name: 'AccountTrigger', bi: true, bu: true, body: 'trigger AccountTrigger on Account (before insert, before update) {\n    AccountTriggerHandler.run();\n    for (Account a : Trigger.new) { if (a.Credit_Limit__c == null) a.Credit_Limit__c = 0; if (a.ERP_Id__c != null) a.Key_Account__c = true; }\n}' }],
  Opportunity: [{ name: 'OpportunityTrigger', au: true, body: 'trigger OpportunityTrigger on Opportunity (after update) {\n    OpportunityService.rollupExpectedMargin(Trigger.new); // uses Expected_Margin__c, Deal_Score__c\n}' }],
  Invoice__c: [{ name: 'InvoiceTrigger', bi: true, bu: true, au: true, body: 'trigger InvoiceTrigger on Invoice__c (before insert, before update, after update) {\n    InvoiceTriggerHandler.recalculate(Trigger.new); // Subtotal__c, Tax_Amount__c, Total__c, Balance_Due__c\n    InvoiceTriggerHandler.flagOverdue(Trigger.new);  // Days_Overdue__c\n}' }]
};

const D365 = require('fs').readFileSync(require('path').join(__dirname, '..', 'assets', 'targets', 'd365-sales.json'), 'utf8');

/** Returns { status, body } for a Salesforce API URL, or null when unknown. */
function respond(url) {
  const ok = body => ({ status: 200, body });
  if (/\/services\/data\/v59\.0\/?$/.test(url)) return ok({ sobjects: '/services/data/v59.0/sobjects' });
  if (/\/sobjects\/?$/.test(url)) return ok({ sobjects: Object.values(ORG).map(o => ({ name: o.name, label: o.label, custom: o.custom, queryable: true })) });
  let m = url.match(/\/sobjects\/([^/]+)\/describe\/?$/); if (m) return ORG[m[1]] ? ok(ORG[m[1]]) : { status: 404, body: [{ message: 'not found' }] };
  m = url.match(/ui-api\/object-info\/([^/]+)\/picklist-values\/([^/?]+)/); if (m) return ok(PICKLIST_RT(m[1], m[2]));
  m = url.match(/limits\/recordCount\?sObjects=([^&]+)/); if (m) return ok({ sObjects: [{ name: m[1], count: RECORD_COUNT[decodeURIComponent(m[1])] || 0 }] });
  const q = url.includes('q=') ? decodeURIComponent(url.split('q=')[1]) : '';
  const objOf = re => { const x = q.match(re); return x ? x[1] : null; };
  if (url.includes('/tooling/query/')) {
    if (q.includes('FROM EntityDefinition')) { const o = objOf(/QualifiedApiName = '([^']+)'/); const m = ORG[o]; if (!m) return ok({ records: [] }); const priv = /Invoice|Project|Subscription|Opportunity|Case/.test(o); return ok({ records: [{ QualifiedApiName: o, Label: m.label, InternalSharingModel: priv ? 'Private' : 'ReadWrite', ExternalSharingModel: 'Private', IsFeedEnabled: !m.custom, IsSearchable: true, IsCustomizable: true, KeyPrefix: m.keyPrefix, DeploymentStatus: 'Deployed' }] }); }
    if (q.includes('FROM ValidationRule')) { const o = objOf(/QualifiedApiName = '([^']+)'/); if (!o || !ORG[o]) return ok({ records: [] }); const vr = (VALIDATION_RULES[o] || []).map((r, i) => ({ Id: '03d' + o.slice(0, 3) + i, ValidationName: r.name, Active: r.active !== false, Description: r.desc || '', ErrorMessage: r.msg, ErrorDisplayField: r.field || null, Metadata: { errorConditionFormula: r.formula } })); return ok({ records: vr }); }
    if (q.includes('FROM FlowDefinitionView')) { const o = objOf(/TriggerObjectOrEventLabel = '([^']+)'/); const key = Object.keys(ORG).find(k => k === o || ORG[k].label === o); return ok({ records: (FLOWS[key] || []).map((f, i) => ({ Id: '300' + (key || '').slice(0, 3) + i, ApiName: f.api, Label: f.label, ProcessType: 'AutoLaunchedFlow', TriggerType: f.trigger, IsActive: f.active !== false, Description: f.desc || '', ActiveVersionId: f.active === false ? null : '301x' })) }); }
    if (q.includes('FROM ApexTrigger')) { const o = objOf(/TableEnumOrId = '([^']+)'/); return ok({ records: (TRIGGERS[o] || []).map((t, i) => ({ Id: '01q' + o.slice(0, 3) + i, Name: t.name, Status: 'Active', TableEnumOrId: o, UsageBeforeInsert: !!t.bi, UsageAfterInsert: !!t.ai, UsageBeforeUpdate: !!t.bu, UsageAfterUpdate: !!t.au, UsageAfterDelete: false, Body: t.body })) }); }
    if (q.includes('FROM Layout')) { const o = objOf(/TableEnumOrId = '([^']+)'/); return ok({ records: o && ORG[o] ? LAYOUTS(o) : [] }); }
    if (q.includes('FROM FlexiPage')) { const o = objOf(/EntityDefinitionId = '([^']+)'/); return ok({ records: o && ORG[o] ? FLEXI(o) : [] }); }
    if (q.includes('FROM ProfileLayout')) { const o = objOf(/TableEnumOrId = '([^']+)'/); if (!o || !ORG[o]) return ok({ records: [] }); const L = LAYOUTS(o); const rts = (ORG[o].recordTypeInfos || []).filter(r => !r.master); const recs = []; PROFILES.forEach(p => { recs.push({ Layout: { Name: L[0].Name }, Profile: { Name: p }, RecordType: null }); rts.forEach((r, i) => recs.push({ Layout: { Name: (p === 'System Administrator' || i === 0) ? (L[i + 1] || L[0]).Name : L[0].Name }, Profile: { Name: p }, RecordType: { Name: r.name }, RecordTypeId: r.recordTypeId })); }); return ok({ records: recs }); }
    if (q.includes('FROM CustomObject')) { const d = objOf(/DeveloperName = '([^']+)'/); return ok({ records: [{ Description: OBJECT_DESCRIPTION[d + '__c'] || '' }] }); }
    return ok({ records: [] });
  }
  if (url.includes('/query/')) {
    if (q.includes('FROM ObjectPermissions') && /IsOwnedByProfile\s*=\s*false/.test(q)) { const o = objOf(/SobjectType = '([^']+)'/); if (!o || !ORG[o]) return ok({ records: [] }); const sets = [['Sales_Ops', 'Sales Ops', [1,1,1,1,0,0]], ['Read_Only_Analytics', 'Read-Only Analytics', [1,0,0,0,1,0]]]; if (o === 'Invoice__c' || o === 'Invoice_Line__c') sets.push(['Finance_Billing', 'Finance Billing', [1,1,1,1,1,1]]); return ok({ records: sets.map(([n, l, c]) => ({ Parent: { Name: n, Label: l, IsOwnedByProfile: false }, ParentId: '0PS' + n.slice(0, 3), SobjectType: o, PermissionsRead: !!c[0], PermissionsCreate: !!c[1], PermissionsEdit: !!c[2], PermissionsDelete: !!c[3], PermissionsViewAllRecords: !!c[4], PermissionsModifyAllRecords: !!c[5] })) }); }
    if (q.includes('FROM ObjectPermissions')) { const o = objOf(/SobjectType = '([^']+)'/); return ok({ records: PROFILES.filter(p => !(o === 'Invoice__c' && p === 'Service Agent')).map(p => { const c = CRUD[p]; return { Parent: { Profile: { Name: p } }, SobjectType: o, PermissionsRead: !!c[0], PermissionsCreate: !!c[1], PermissionsEdit: !!c[2], PermissionsDelete: !!c[3], PermissionsViewAllRecords: !!c[4], PermissionsModifyAllRecords: !!c[5] }; }) }); }
    if (q.includes('FROM FieldPermissions')) { const o = objOf(/SobjectType = '([^']+)'/); if (!o || !ORG[o]) return ok({ records: [] }); const fields = ORG[o].fields.filter(f => f.custom || /Description|Phone|Website|Amount|Email/.test(f.name)); const recs = []; PROFILES.forEach((p, pi) => fields.forEach((f, fi) => { const read = p === 'System Administrator' || (fi + pi) % 5 !== 0; const edit = p === 'System Administrator' || (read && (fi + pi) % 3 !== 0 && p !== 'Finance'); recs.push({ Parent: { Profile: { Name: p } }, SobjectType: o, Field: o + '.' + f.name, PermissionsRead: read, PermissionsEdit: edit }); })); return ok({ records: recs }); }
    if (q.includes('FROM FieldDefinition')) { const o = objOf(/EntityDefinitionId = '([^']+)'/); if (!o || !ORG[o]) return ok({ records: [] }); const has = new Set(DESCRIBED[o] || []); return ok({ records: ORG[o].fields.map(f => ({ QualifiedApiName: f.name, Description: has.has(f.name) ? 'Documented field' : (f.custom ? '' : 'Standard field') })) }); }
    return ok({ records: [] });
  }
  if (url.endsWith('d365-sales.json')) return ok(JSON.parse(D365));
  return null;
}

module.exports = { ORG, respond, RECORD_COUNT };
