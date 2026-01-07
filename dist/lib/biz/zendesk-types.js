/**
 * Zendesk API Types
 * Extended for v0.9 with macros support
 */
// Enums
export var TicketPriority;
(function (TicketPriority) {
    TicketPriority["Low"] = "low";
    TicketPriority["Normal"] = "normal";
    TicketPriority["High"] = "high";
    TicketPriority["Urgent"] = "urgent";
})(TicketPriority || (TicketPriority = {}));
export var TicketStatus;
(function (TicketStatus) {
    TicketStatus["New"] = "new";
    TicketStatus["Open"] = "open";
    TicketStatus["Pending"] = "pending";
    TicketStatus["Hold"] = "hold";
    TicketStatus["Solved"] = "solved";
    TicketStatus["Closed"] = "closed";
})(TicketStatus || (TicketStatus = {}));
export var TicketType;
(function (TicketType) {
    TicketType["Problem"] = "problem";
    TicketType["Incident"] = "incident";
    TicketType["Question"] = "question";
    TicketType["Task"] = "task";
})(TicketType || (TicketType = {}));
