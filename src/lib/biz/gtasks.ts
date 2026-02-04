import { getConfig } from "../../commands/config.js";
import { execSync } from "child_process";
import { google } from "googleapis";
import { JWT } from "google-auth-library";

async function getSecret(secretId: string): Promise<string> {
  try {
    return execSync(`gcloud secrets versions access latest --secret=${secretId} --project=tigerv0`, { 
      encoding: 'utf8', 
      stdio: 'pipe' 
    }).trim();
  } catch (e: any) {
    throw new Error(`Failed to fetch secret ${secretId}: ${e.stderr || e.message}`);
  }
}

async function getSecretOrConfig(secretId: string, configKey: string): Promise<string> {
  try {
    return await getSecret(secretId);
  } catch {
    const config = getConfig();
    const value = config[configKey as keyof typeof config];
    if (!value || typeof value !== 'string') {
      throw new Error(`Secret ${secretId} not available and no fallback config.${configKey}`);
    }
    return value;
  }
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
  updated?: string;
  parent?: string;
  position?: string;
  links?: Array<{ type: string; description: string; link: string }>;
}

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
  updated?: string;
  parent?: string;
  position?: string;
  links?: Array<{ type: string; description: string; link: string }>;
}

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

interface CreateTaskOptions {
  notes?: string;
  due?: Date;
  parent?: string;
}

export class GoogleTasksClient {
  private tasks: any;
  private huskyListId: string | null = null;

  constructor(tasks: any) {
    this.tasks = tasks;
  }

  static async fromConfig(): Promise<GoogleTasksClient> {
    const config = getConfig();
    
    const keyJson = await getSecretOrConfig("HUSKY_GTASKS_SA_KEY", "gtasksSaKey");
    const key = JSON.parse(keyJson);
    
    const subject = config.gtasksSubject || "simon@sfx-ecommerce.com";
    
    const auth = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/tasks"],
      subject,
    });
    
    const tasks = google.tasks({ version: "v1", auth });
    return new GoogleTasksClient(tasks);
  }

  async getLists(): Promise<GoogleTaskList[]> {
    const res = await this.tasksClient.tasklists.list();
    return (res.data.items || []) as GoogleTaskList[];
  }

  async createList(title: string): Promise<GoogleTaskList> {
    const res = await this.tasks.tasklists.insert({
      requestBody: { title },
    });
    return res.data as GoogleTaskList;
  }

  async getOrCreateHuskyList(): Promise<GoogleTaskList> {
    if (this.huskyListId) {
      return { id: this.huskyListId, title: "Husky" };
    }
    
    const lists = await this.getLists();
    let huskyList = lists.find(l => l.title === "Husky");
    
    if (!huskyList) {
      huskyList = await this.createList("Husky");
    }
    
    this.huskyListId = huskyList.id!;
    return huskyList;
  }

  async getTasks(listId?: string, opts?: { showCompleted?: boolean }): Promise<GoogleTask[]> {
    const targetList = listId || (await this.getOrCreateHuskyList()).id!;
    const res = await this.tasks.tasks.list({
      tasklist: targetList,
      showCompleted: opts?.showCompleted ?? false,
      showHidden: false,
    });
    return (res.data.items || []) as GoogleTask[];
  }

  async createTask(title: string, opts?: CreateTaskOptions, listId?: string): Promise<GoogleTask> {
    const targetList = listId || (await this.getOrCreateHuskyList()).id!;
    const res = await this.tasks.tasks.insert({
      tasklist: targetList,
      requestBody: {
        title,
        notes: opts?.notes,
        due: opts?.due ? opts.due.toISOString() : undefined,
        parent: opts?.parent,
      },
    });
    return res.data as GoogleTask;
  }

  async completeTask(taskId: string, listId?: string): Promise<GoogleTask> {
    const targetList = listId || (await this.getOrCreateHuskyList()).id!;
    const res = await this.tasks.tasks.patch({
      tasklist: targetList,
      task: taskId,
      requestBody: { status: "completed" },
    });
    return res.data as GoogleTask;
  }

  async addNote(taskId: string, note: string, listId?: string): Promise<GoogleTask> {
    const targetList = listId || (await this.getOrCreateHuskyList()).id!;
    
    const current = await this.tasks.tasks.get({
      tasklist: targetList,
      task: taskId,
    });
    
    const existingNotes = current.data.notes || "";
    const newNotes = existingNotes 
      ? `${existingNotes}\n\n---\n${new Date().toISOString()}\n${note}`
      : note;
    
    const res = await this.tasks.tasks.patch({
      tasklist: targetList,
      task: taskId,
      requestBody: { notes: newNotes },
    });
    return res.data as GoogleTask;
  }

  async deleteTask(taskId: string, listId?: string): Promise<void> {
    const targetList = listId || (await this.getOrCreateHuskyList()).id!;
    await this.tasks.tasks.delete({
      tasklist: targetList,
      task: taskId,
    });
  }

  async createForHuman(title: string, opts?: {
    notes?: string;
    due?: Date | "tomorrow" | "next-week";
    link?: string;
  }): Promise<GoogleTask> {
    let dueDate: Date | undefined;
    if (opts?.due === "tomorrow") {
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);
    } else if (opts?.due === "next-week") {
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
    } else if (opts?.due instanceof Date) {
      dueDate = opts.due;
    }
    
    let notes = opts?.notes || "";
    if (opts?.link) {
      notes += `\n\nLink: ${opts.link}`;
    }
    notes += `\n\n---\nCreated by Husky Agent at ${new Date().toISOString()}`;
    
    return this.createTask(`[Human Action] ${title}`, { notes, due: dueDate });
  }

  async pollForAgentTasks(since?: Date): Promise<GoogleTask[]> {
    const tasks = await this.getTasks();
    
    return tasks.filter(task => {
      if (task.title.startsWith("[Human Action]")) return false;
      if (task.status === "completed") return false;
      if (since && task.updated) {
        const updated = new Date(task.updated);
        if (updated < since) return false;
      }
      return true;
    });
  }
}