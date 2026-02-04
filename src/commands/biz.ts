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
import { gotessCommand } from "./biz/gotess.js";
import { skuterzoneCommand } from "./biz/skuterzone.js";
import { emoveCommand } from "./biz/emove.js";
import { wattizCommand } from "./biz/wattiz.js";
import { shopifyCommand } from "./biz/shopify.js";
import { supplierFeedCommand } from "./biz/supplier-feed.js";
import { gtasksCommand } from "./biz/gtasks.js";
import { guards } from "../lib/permissions.js";

export const bizCommand = new Command("biz")
    .description("Business operations for autonomous agents")
    .hook("preAction", guards.bizAccess)  // RBAC: Require biz permissions
    .addCommand(ordersCommand)
    .addCommand(productsCommand)
    .addCommand(ticketsCommand)
    .addCommand(customersCommand)
    .addCommand(seatableCommand)
    .addCommand(qdrantCommand)
    .addCommand(gotessCommand)
    .addCommand(skuterzoneCommand)
    .addCommand(emoveCommand)
    .addCommand(wattizCommand)
    .addCommand(shopifyCommand)
    .addCommand(supplierFeedCommand)
  .addCommand(gtasksCommand);

export default bizCommand;
