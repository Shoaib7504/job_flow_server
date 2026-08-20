import { prisma } from "../config/db.connect.js";

const applicationInclude = {
  interviews: { orderBy: { at: "asc" } },
  reminders: true,
  timelineEvents: { orderBy: { at: "asc" } },
};

const toClient = (app) => ({
  id: app.id,
  company: app.company,
  role: app.role,
  location: app.location,
  salary: app.salary,
  source: app.source,
  stage: app.stage,
  priority: app.priority,
  link: app.link,
  notes: app.notes,
  appliedAt: app.appliedAt,
  updatedAt: app.updatedAt,
  interviews: app.interviews ?? [],
  reminders: app.reminders ?? [],
  timeline: app.timelineEvents ?? [],
});

export const getApplications = async (req, res) => {
  try {
    const apps = await prisma.application.findMany({
      where: { userId: req.user.id },
      include: applicationInclude,
      orderBy: { updatedAt: "desc" },
    });
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Applications fetched successfully",
      data: apps.map(toClient),
    });
  } catch (error) {
    console.log("Error fetching applications", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getApplication = async (req, res) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: applicationInclude,
    });
    if (!app) {
      return res.status(404).json({ message: "Application not found" });
    }
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Application fetched successfully",
      data: toClient(app),
    });
  } catch (error) {
    console.log("Error fetching application", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const createApplication = async (req, res) => {
  try {
    const { company, role, location = "", salary = "", source, stage, link = "", notes = "" } = req.body;
    if (!company || !role || !source || !stage) {
      return res.status(400).json({ message: "company, role, source and stage are required" });
    }
    const app = await prisma.application.create({
      data: {
        userId: req.user.id,
        company,
        role,
        location,
        salary,
        source,
        stage,
        priority: "MEDIUM",
        link,
        notes,
        timelineEvents: {
          create: [{ label: "Application submitted", type: "stage" }],
        },
      },
      include: applicationInclude,
    });
    res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Application created successfully",
      data: toClient(app),
    });
  } catch (error) {
    console.log("Error creating application", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateApplication = async (req, res) => {
  try {
    const { company, role, location, salary, source, stage, priority, link, notes } = req.body;
    const current = await prisma.application.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!current) {
      return res.status(404).json({ message: "Application not found" });
    }

    const data = {
      company: company ?? current.company,
      role: role ?? current.role,
      location: location ?? current.location,
      salary: salary ?? current.salary,
      source: source ?? current.source,
      stage: stage ?? current.stage,
      priority: priority ?? current.priority,
      link: link ?? current.link,
      notes: notes ?? current.notes,
    };
    if (stage && stage !== current.stage) {
      data.timelineEvents = {
        create: [{ label: `Moved to ${stage}`, type: "stage" }],
      };
    }

    const app = await prisma.application.update({
      where: { id: current.id },
      data,
      include: applicationInclude,
    });
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Application updated successfully",
      data: toClient(app),
    });
  } catch (error) {
    console.log("Error updating application", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const patchApplication = async (req, res) => {
  try {
    const { action, ...payload } = req.body;
    const current = await prisma.application.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: applicationInclude,
    });
    if (!current) {
      return res.status(404).json({ message: "Application not found" });
    }

    let app;
    switch (action) {
      case "note": {
        app = await prisma.application.update({
          where: { id: current.id },
          data: {
            notes: payload.text,
            timelineEvents: {
              create: [{ label: "Note added", type: "note" }],
            },
          },
          include: applicationInclude,
        });
        break;
      }
      case "interview": {
        await prisma.interview.create({
          data: {
            applicationId: current.id,
            kind: payload.kind,
            withWhom: payload.withWhom || "TBD",
            at: new Date(payload.at),
          },
        });
        app = await prisma.application.update({
          where: { id: current.id },
          data: {
            timelineEvents: {
              create: [{ label: `Interview scheduled: ${payload.kind}`, type: "interview" }],
            },
          },
          include: applicationInclude,
        });
        break;
      }
      case "reminder": {
        await prisma.reminder.create({
          data: {
            applicationId: current.id,
            label: payload.label,
            at: new Date(payload.at),
          },
        });
        app = await prisma.application.update({
          where: { id: current.id },
          data: {},
          include: applicationInclude,
        });
        break;
      }
      case "toggleReminder": {
        const reminder = await prisma.reminder.findFirst({
          where: { id: payload.reminderId, applicationId: current.id },
        });
        if (!reminder) {
          return res.status(404).json({ message: "Reminder not found" });
        }
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { done: !reminder.done },
        });
        app = await prisma.application.update({
          where: { id: current.id },
          data: {},
          include: applicationInclude,
        });
        break;
      }
      case "stage": {
        app = await prisma.application.update({
          where: { id: current.id },
          data: {
            stage: payload.stage,
            timelineEvents: {
              create: [{ label: `Moved to ${payload.stage}`, type: "stage" }],
            },
          },
          include: applicationInclude,
        });
        break;
      }
      default: {
        return res.status(400).json({ message: "Unsupported patch action" });
      }
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Application patched successfully",
      data: toClient(app),
    });
  } catch (error) {
    console.log("Error patching application", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteApplication = async (req, res) => {
  try {
    const current = await prisma.application.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!current) {
      return res.status(404).json({ message: "Application not found" });
    }
    await prisma.application.delete({ where: { id: current.id } });
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Application deleted successfully",
      data: { id: current.id },
    });
  } catch (error) {
    console.log("Error deleting application", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
