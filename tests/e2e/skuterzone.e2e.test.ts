/**
 * Skuterzone E2E Tests
 *
 * Tests the Skuterzone integration with real API calls and browser automation
 * Requires valid credentials in environment variables or config
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SkuterzonePlaywrightClient } from '../../dist/lib/biz/skuterzone-playwright.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Skuterzone E2E Tests', () => {
    let client: SkuterzonePlaywrightClient;
    let testOrderId: string;

    beforeAll(async () => {
        // Skip tests if credentials are not provided
        const username = process.env.PROD_SKUTERZONE_USERNAME || process.env.SKUTERZONE_USERNAME;
        const password = process.env.PROD_SKUTERZONE_PASSWORD || process.env.SKUTERZONE_PASSWORD;

        if (!username || !password) {
            console.warn('⚠️  Skipping Skuterzone E2E tests - credentials not provided');
            console.warn('   Set SKUTERZONE_USERNAME and SKUTERZONE_PASSWORD to run these tests');
            return;
        }

        client = SkuterzonePlaywrightClient.fromConfig();
    }, 30000);

    afterAll(async () => {
        if (client) {
            await client.close();
        }
    });

    it('should authenticate successfully', async () => {
        if (!client) return;

        const result = await client.login();

        expect(result.success).toBe(true);
        expect(result.cookies).toBeTruthy();
        expect(result.error).toBeUndefined();
    }, 30000);

    it('should list orders', async () => {
        if (!client) return;

        const orders = await client.listOrders();

        expect(orders).toBeDefined();
        expect(Array.isArray(orders)).toBe(true);
        expect(orders.length).toBeGreaterThan(0);

        // Validate order structure
        const firstOrder = orders[0];
        expect(firstOrder.id).toBeTruthy();
        expect(firstOrder.orderNumber).toBeTruthy();
        expect(firstOrder.date).toBeTruthy();
        expect(firstOrder.status).toBeTruthy();
        expect(firstOrder.total).toBeTruthy();

        // Store order ID for next tests
        testOrderId = firstOrder.id;

        console.log(`✓ Found ${orders.length} orders`);
        console.log(`  First order: #${firstOrder.orderNumber} - ${firstOrder.total}`);
    }, 60000);

    it('should get order details', async () => {
        if (!client || !testOrderId) return;

        const order = await client.getOrder(testOrderId);

        expect(order).toBeDefined();
        expect(order.id).toBe(testOrderId);
        expect(order.orderNumber).toBeTruthy();
        expect(order.date).toBeTruthy();
        expect(order.status).toBeTruthy();
        expect(order.total).toBeTruthy();
        expect(order.customer).toBeDefined();
        expect(order.customer.email).toBeTruthy();
        expect(order.items).toBeDefined();
        expect(Array.isArray(order.items)).toBe(true);

        console.log(`✓ Order #${order.orderNumber}`);
        console.log(`  Status: ${order.status}`);
        console.log(`  Total: ${order.total}`);
        console.log(`  Items: ${order.items.length}`);
        console.log(`  Customer: ${order.customer.email}`);
    }, 60000);

    it('should download invoice if available', async () => {
        if (!client || !testOrderId) return;

        const order = await client.getOrder(testOrderId);

        if (order.invoiceUrl) {
            const tempPath = path.join(os.tmpdir(), `skuterzone-test-invoice-${testOrderId}.pdf`);

            try {
                const success = await client.downloadInvoice(testOrderId, tempPath);

                if (success && fs.existsSync(tempPath)) {
                    // Verify it's a PDF
                    const buffer = fs.readFileSync(tempPath);
                    const isPDF = buffer.toString('ascii', 0, 4) === '%PDF';
                    expect(isPDF).toBe(true);

                    // Get file size
                    const stats = fs.statSync(tempPath);
                    expect(stats.size).toBeGreaterThan(0);

                    console.log(`✓ Invoice downloaded: ${(stats.size / 1024).toFixed(1)} KB`);

                    // Cleanup
                    fs.unlinkSync(tempPath);
                } else {
                    console.log('⚠️  Invoice download returned false or file not found');
                }
            } catch (error) {
                console.log('⚠️  Invoice download failed:', (error as Error).message);
            }
        } else {
            console.log('⚠️  No invoice available for this order');
        }
    }, 60000);

    it('should search products', async () => {
        if (!client) return;

        const products = await client.searchProducts('brake');

        expect(products).toBeDefined();
        expect(Array.isArray(products)).toBe(true);

        if (products.length > 0) {
            const firstProduct = products[0];
            expect(firstProduct.name).toBeTruthy();
            expect(firstProduct.url).toBeTruthy();

            console.log(`✓ Found ${products.length} products for "brake"`);
            console.log(`  First: ${firstProduct.name}`);
        }
    }, 60000);
});
