/**
 * Husky Biz Command
 *
 * Business operations for autonomous agents
 * Integrates with Billbee, Zendesk, SeaTable, and Qdrant
 */
import { Command } from "commander";
import { ordersCommand } from "./biz/orders.js";
import { productsCommand } from "./biz/products.js";
import { ticketsCommand } from "./biz/tickets.js";
import { customersCommand } from "./biz/customers.js";
import { seatableCommand } from "./biz/seatable.js";
import { qdrantCommand } from "./biz/qdrant.js";
export const bizCommand = new Command("biz")
    .description("Business operations for autonomous agents")
    .addCommand(ordersCommand)
    .addCommand(productsCommand)
    .addCommand(ticketsCommand)
    .addCommand(customersCommand)
    .addCommand(seatableCommand)
    .addCommand(qdrantCommand);
export default bizCommand;
