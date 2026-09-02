"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { api, getAuthToken } from "@/lib/api"
import { toast } from "sonner"

export interface Project {
    name: string
    path: string
    updated_at: string
    stages: Record<string, boolean>
}

interface ProjectContextType {
    projects: Project[]
    activeProject: Project | null
    isLoading: boolean
    refreshProjects: () => Promise<Project[]>
    setActiveProject: (project: Project | null) => void
    createProject: (name: string, description?: string) => Promise<boolean>
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export function ProjectProvider({ children }: { children: React.ReactNode }) {
    const [projects, setProjects] = useState<Project[]>([])
    const [activeProject, setActiveProject] = useState<Project | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const refreshProjects = async (): Promise<Project[]> => {
        // 未登录（例如停留在登录页）时不请求数据，避免无意义的 401 报错
        if (typeof window !== "undefined" && !getAuthToken()) return []
        setIsLoading(true)
        try {
            const res = await api.get("/api/common/projects")
            setProjects(res.projects)

            // Restore active project if exists in new list
            if (activeProject) {
                const stillExists = res.projects.find((p: Project) => p.name === activeProject.name)
                if (stillExists) {
                    setActiveProject(stillExists)
                } else {
                    setActiveProject(null)
                }
            }

            return res.projects as Project[]
        } catch (error) {
            console.error("Failed to fetch projects", error)
            toast.error("加载项目列表失败")
            return []
        } finally {
            setIsLoading(false)
        }
    }

    const createProject = async (name: string, description?: string) => {
        try {
            await api.post("/api/common/projects", { name, description })
            toast.success("项目创建成功")
            // Refresh and auto-select the newly created project
            const list = await refreshProjects()
            const newProject = list.find(p => p.name === name)
            if (newProject) {
                setActiveProject(newProject)
            }
            return true
        } catch (error: any) {
            toast.error(error.message || "创建项目失败")
            return false
        }
    }

    // Initial load
    useEffect(() => {
        refreshProjects()
    }, [])

    return (
        <ProjectContext.Provider value={{
            projects,
            activeProject,
            isLoading,
            refreshProjects,
            setActiveProject,
            createProject
        }}>
            {children}
        </ProjectContext.Provider>
    )
}

export function useProject() {
    const context = useContext(ProjectContext)
    if (context === undefined) {
        throw new Error("useProject must be used within a ProjectProvider")
    }
    return context
}
