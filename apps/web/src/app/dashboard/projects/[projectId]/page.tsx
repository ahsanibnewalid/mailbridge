import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { userCanManageProject } from "@/lib/project-auth";
import { db } from "@/lib/db";
import { ProjectSettings } from "../../../project-settings";
export const dynamic = "force-dynamic";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) { const user = await getCurrentUser(); if (!user) redirect("/login"); const { projectId } = await params; const access = await userCanManageProject(user.id, projectId, ["OWNER", "ADMINISTRATOR", "DEVELOPER", "READ_ONLY"]); if (!access) notFound(); const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, monthlyQuota: true, enabled: true } }); if (!project) notFound(); return <ProjectSettings project={project} />; }
