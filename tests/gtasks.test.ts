import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { 
  GoogleTasksClient, 
  GoogleTask, 
  GTasksError, 
  GTasksAuthError, 
  GTasksNotFoundError 
} from "../src/lib/biz/gtasks.js";

// Mock googleapis
vi.mock("googleapis", () => ({
  google: {
    tasks: vi.fn(() => ({
      tasks: {
        list: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
      },
      tasklists: {
        list: vi.fn(),
        insert: vi.fn(),
      },
    })),
  },
}));

// Mock config
vi.mock("../src/commands/config.js", () => ({
  getConfig: vi.fn(() => ({
    apiUrl: "https://test-api.com",
    apiKey: "test-key",
    gtasksSubject: "test@example.com",
  })),
}));

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn(() => '{"client_email": "test@test.com", "private_key": "test-key"}'),
}));

describe("GoogleTasksClient", () => {
  let mockTasks: any;
  let mockTasklists: any;

  beforeEach(() => {
    mockTasks = {
      list: vi.fn(),
      insert: vi.fn(),
      patch: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    };
    mockTasklists = {
      list: vi.fn(),
      insert: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Error Classes", () => {
    it("should create GTasksError with correct properties", () => {
      const error = new GTasksError("Test error", "TEST_CODE");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.name).toBe("GTasksError");
    });

    it("should create GTasksAuthError", () => {
      const originalError = new Error("Auth failed");
      const error = new GTasksAuthError("Auth error", originalError);
      expect(error.message).toBe("Auth error");
      expect(error.code).toBe("AUTH_ERROR");
      expect(error.originalError).toBe(originalError);
      expect(error.name).toBe("GTasksAuthError");
    });

    it("should create GTasksNotFoundError", () => {
      const error = new GTasksNotFoundError("Task not found");
      expect(error.message).toBe("Task not found");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.name).toBe("GTasksNotFoundError");
    });
  });

  describe("Task Operations", () => {
    it("should get task lists", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      const mockLists = [
        { id: "1", title: "List 1" },
        { id: "2", title: "List 2" },
      ];
      mockTasklists.list.mockResolvedValue({ data: { items: mockLists } });

      const result = await client.getLists();
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("List 1");
    });

    it("should create a new list", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      const newList = { id: "3", title: "New List" };
      mockTasklists.insert.mockResolvedValue({ data: newList });

      const result = await client.createList("New List");
      expect(result.id).toBe("3");
      expect(result.title).toBe("New List");
    });

    it("should get or create Husky list", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      mockTasklists.list.mockResolvedValue({ data: { items: [] } });
      mockTasklists.insert.mockResolvedValue({ 
        data: { id: "husky-1", title: "Husky" } 
      });

      const result = await client.getOrCreateHuskyList();
      expect(result.title).toBe("Husky");
      expect(mockTasklists.insert).toHaveBeenCalledWith({
        requestBody: { title: "Husky" },
      });
    });

    it("should get tasks from a list", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      const mockTasksList = [
        { id: "t1", title: "Task 1", status: "needsAction" },
        { id: "t2", title: "Task 2", status: "completed" },
      ];
      mockTasks.list.mockResolvedValue({ data: { items: mockTasksList } });
      mockTasklists.list.mockResolvedValue({ 
        data: { items: [{ id: "list-1", title: "Husky" }] } 
      });

      const result = await client.getTasks();
      expect(result).toHaveLength(2);
      expect(mockTasks.list).toHaveBeenCalledWith({
        tasklist: "list-1",
        showCompleted: false,
        showHidden: false,
      });
    });

    it("should create a task", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      const newTask = { id: "t1", title: "Test Task" };
      mockTasks.insert.mockResolvedValue({ data: newTask });
      mockTasklists.list.mockResolvedValue({ 
        data: { items: [{ id: "list-1", title: "Husky" }] } 
      });

      const result = await client.createTask("Test Task", { notes: "Notes" });
      expect(result.title).toBe("Test Task");
      expect(mockTasks.insert).toHaveBeenCalledWith({
        tasklist: "list-1",
        requestBody: {
          title: "Test Task",
          notes: "Notes",
          due: undefined,
          parent: undefined,
        },
      });
    });

    it("should complete a task", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      mockTasks.patch.mockResolvedValue({ 
        data: { id: "t1", status: "completed" } 
      });
      mockTasklists.list.mockResolvedValue({ 
        data: { items: [{ id: "list-1", title: "Husky" }] } 
      });

      await client.completeTask("t1");
      expect(mockTasks.patch).toHaveBeenCalledWith({
        tasklist: "list-1",
        task: "t1",
        requestBody: { status: "completed" },
      });
    });

    it("should add note to task", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      mockTasks.get.mockResolvedValue({ data: { notes: "Existing notes" } });
      mockTasks.patch.mockResolvedValue({ data: { id: "t1" } });
      mockTasklists.list.mockResolvedValue({ 
        data: { items: [{ id: "list-1", title: "Husky" }] } 
      });

      await client.addNote("t1", "New note");
      expect(mockTasks.patch).toHaveBeenCalled();
      const callArg = mockTasks.patch.mock.calls[0][0];
      expect(callArg.requestBody.notes).toContain("New note");
    });
  });

  describe("createForHuman", () => {
    it("should create task with [Human Action] prefix", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      mockTasks.insert.mockResolvedValue({ 
        data: { id: "t1", title: "[Human Action] Review PR" } 
      });
      mockTasklists.list.mockResolvedValue({ 
        data: { items: [{ id: "list-1", title: "Husky" }] } 
      });

      const result = await client.createForHuman("Review PR");
      expect(result.title).toBe("[Human Action] Review PR");
      expect(mockTasks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            title: "[Human Action] Review PR",
          }),
        })
      );
    });

    it("should handle due date shortcuts", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      mockTasks.insert.mockResolvedValue({ data: { id: "t1" } });
      mockTasklists.list.mockResolvedValue({ 
        data: { items: [{ id: "list-1", title: "Husky" }] } 
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await client.createForHuman("Task", { due: "tomorrow" });
      
      const callArg = mockTasks.insert.mock.calls[0][0];
      const dueDate = new Date(callArg.requestBody.due);
      expect(dueDate.getDate()).toBe(tomorrow.getDate());
    });
  });

  describe("pollForAgentTasks", () => {
    it("should filter out completed and human action tasks", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      const mockTasksList = [
        { id: "t1", title: "Code review", status: "needsAction", updated: new Date().toISOString() },
        { id: "t2", title: "[Human Action] Manual test", status: "needsAction", updated: new Date().toISOString() },
        { id: "t3", title: "Old task", status: "completed", updated: new Date().toISOString() },
      ];
      mockTasks.list.mockResolvedValue({ data: { items: mockTasksList } });
      mockTasklists.list.mockResolvedValue({ 
        data: { items: [{ id: "list-1", title: "Husky" }] } 
      });

      const result = await client.pollForAgentTasks();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Code review");
    });

    it("should respect since parameter", async () => {
      const client = new GoogleTasksClient(mockTasks, mockTasklists);
      const oldDate = new Date("2024-01-01");
      const newDate = new Date();
      
      const mockTasksList = [
        { id: "t1", title: "Old task", status: "needsAction", updated: oldDate.toISOString() },
        { id: "t2", title: "New task", status: "needsAction", updated: newDate.toISOString() },
      ];
      mockTasks.list.mockResolvedValue({ data: { items: mockTasksList } });
      mockTasklists.list.mockResolvedValue({ 
        data: { items: [{ id: "list-1", title: "Husky" }] } 
      });

      const since = new Date("2024-06-01");
      const result = await client.pollForAgentTasks(since);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("New task");
    });
  });
});
