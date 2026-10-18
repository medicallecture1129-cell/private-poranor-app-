import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Course, Folder, CourseClass, MediaResource, StudentUser } from '../../types';
import { 
  subscribeFolders, 
  subscribeClasses,
  subscribeResources, 
  createFolder, 
  updateFolderName,
  deleteFolder, 
  createClass,
  updateClassTitle,
  deleteClass,
  createResource, 
  deleteResource 
} from '../../services/db';
import { CourseMembers } from './CourseMembers';
import { DiscussionRoom } from './DiscussionRoom';
import { ProtectedVideoPlayer } from './ProtectedVideoPlayer';
import { PdfViewerModal } from './PdfViewerModal';
import { 
  ArrowLeft, 
  FolderPlus, 
  Folder as FolderIcon, 
  Video, 
  FileText, 
  Plus, 
  Trash2, 
  Edit2,
  ChevronRight, 
  Users, 
  MessageSquare, 
  BookOpen, 
  GraduationCap,
  Play 
} from 'lucide-react';

interface CourseViewProps {
  course: Course;
  students: StudentUser[];
  onBack: () => void;
}

export const CourseView: React.FC<CourseViewProps> = ({ course, students, onBack }) => {
  const { role } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<'content' | 'members' | 'discussion'>('content');

  // Hierarchy Navigation
  const [folders, setFolders] = useState<Folder[]>([]);
  const [classes, setClasses] = useState<CourseClass[]>([]);
  const [resources, setResources] = useState<MediaResource[]>([]);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentClass, setCurrentClass] = useState<CourseClass | null>(null);

  // Modals
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [newClassTitle, setNewClassTitle] = useState('');

  // Rename Modals
  const [renameTargetFolder, setRenameTargetFolder] = useState<Folder | null>(null);
  const [renameFolderNameVal, setRenameFolderNameVal] = useState('');

  const [renameTargetClass, setRenameTargetClass] = useState<CourseClass | null>(null);
  const [renameClassTitleVal, setRenameClassTitleVal] = useState('');

  // Add Material Modal (Video / Note)
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [resourceType, setResourceType] = useState<'video' | 'pdf'>('video');
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');

  // Active Play / View
  const [activeVideo, setActiveVideo] = useState<{ title: string; url: string } | null>(null);
  const [activePdf, setActivePdf] = useState<{ title: string; url: string } | null>(null);

  // Real-time Firestore Subscriptions
  useEffect(() => {
    const unsubFolders = subscribeFolders(
      course.id, 
      setFolders,
      (err) => toastError('Error loading folders: ' + err.message)
    );
    const unsubClasses = subscribeClasses(
      course.id,
      setClasses,
      (err) => toastError('Error loading classes: ' + err.message)
    );
    const unsubResources = subscribeResources(
      course.id, 
      setResources,
      (err) => toastError('Error loading materials: ' + err.message)
    );

    return () => {
      unsubFolders();
      unsubClasses();
      unsubResources();
    };
  }, [course.id, toastError]);

  // Keep currentClass synced with database updates
  useEffect(() => {
    if (currentClass) {
      const updated = classes.find(c => c.id === currentClass.id);
      if (updated) setCurrentClass(updated);
    }
  }, [classes]);

  // Filter items in current view
  const visibleFolders = folders.filter(f => (f.parentId || null) === currentFolderId);
  const visibleClasses = classes.filter(c => (c.folderId || null) === currentFolderId);
  const currentClassMaterials = currentClass 
    ? resources.filter(r => r.classId === currentClass.id)
    : [];

  // Breadcrumbs
  const getBreadcrumbs = () => {
    const crumbs: { id: string | null; name: string; isClass?: boolean }[] = [{ id: null, name: 'Root' }];

    const findFolder = (id: string | null): Folder | undefined => folders.find(f => f.id === id);
    const path: Folder[] = [];
    let curr = findFolder(currentFolderId);

    while (curr) {
      path.unshift(curr);
      curr = curr.parentId ? findFolder(curr.parentId) : undefined;
    }

    path.forEach(f => crumbs.push({ id: f.id, name: f.name }));

    if (currentClass) {
      crumbs.push({ id: currentClass.id, name: currentClass.title, isClass: true });
    }

    return crumbs;
  };

  // Create Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const folderName = newFolderName.trim();
    if (!folderName) return;

    setShowAddFolderModal(false);
    setNewFolderName('');

    try {
      await createFolder(course.id, folderName, currentFolderId);
      toastSuccess(`Folder "${folderName}" created successfully.`);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  };

  // Rename Folder
  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTargetFolder || !renameFolderNameVal.trim()) return;

    const targetId = renameTargetFolder.id;
    const newName = renameFolderNameVal.trim();

    setRenameTargetFolder(null);
    setRenameFolderNameVal('');

    try {
      await updateFolderName(targetId, newName);
      toastSuccess(`Folder renamed to "${newName}".`);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to rename folder');
    }
  };

  // Create Class
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newClassTitle.trim();
    if (!title) return;

    setShowAddClassModal(false);
    setNewClassTitle('');

    try {
      const created = await createClass(course.id, title, currentFolderId);
      toastSuccess(`Class "${title}" created.`);
      setCurrentClass(created);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to create class');
    }
  };

  // Rename Class
  const handleRenameClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTargetClass || !renameClassTitleVal.trim()) return;

    const targetId = renameTargetClass.id;
    const newTitle = renameClassTitleVal.trim();

    setRenameTargetClass(null);
    setRenameClassTitleVal('');

    try {
      await updateClassTitle(targetId, newTitle);
      toastSuccess(`Class renamed to "${newTitle}".`);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to rename class');
    }
  };

  // Create Resource under Current Class
  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClass) return;
    const title = resourceTitle.trim();
    const url = resourceUrl.trim();
    if (!title || !url) return;

    setShowAddResourceModal(false);
    setResourceTitle('');
    setResourceUrl('');

    try {
      await createResource(course.id, title, resourceType, url, currentFolderId, currentClass.id);
      toastSuccess(`${resourceType === 'video' ? 'Class Video' : 'Class Note'} added successfully.`);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to add material');
    }
  };

  // Delete Handlers
  const handleDeleteFolder = async (folder: Folder, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete folder "${folder.name}" and all its contents?`)) {
      try {
        await deleteFolder(folder.id);
        toastSuccess(`Folder "${folder.name}" deleted.`);
      } catch (err: unknown) {
        toastError(err instanceof Error ? err.message : 'Failed to delete folder');
      }
    }
  };

  const handleDeleteClass = async (cClass: CourseClass, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete class "${cClass.title}"?`)) {
      try {
        await deleteClass(cClass.id);
        if (currentClass?.id === cClass.id) setCurrentClass(null);
        toastSuccess(`Class "${cClass.title}" deleted.`);
      } catch (err: unknown) {
        toastError(err instanceof Error ? err.message : 'Failed to delete class');
      }
    }
  };

  const handleDeleteResource = async (res: MediaResource, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${res.title}"?`)) {
      try {
        await deleteResource(res.id);
        toastSuccess(`Material "${res.title}" deleted.`);
      } catch (err: unknown) {
        toastError(err instanceof Error ? err.message : 'Failed to delete material');
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6">
      {/* Course Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (currentClass) {
                setCurrentClass(null);
              } else if (currentFolderId) {
                setCurrentFolderId(null);
              } else {
                onBack();
              }
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {course.name}
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold border border-blue-200 dark:border-blue-900/50">
                {course.batch}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Course Code: #{course.id.slice(-6)} • {course.allowedEmails?.length || 0} Enrolled Members
            </p>
          </div>
        </div>

        {/* Course Tabs Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start md:self-auto">
          <button
            onClick={() => setActiveTab('content')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'content'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Materials</span>
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'members'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Members</span>
          </button>
          <button
            onClick={() => setActiveTab('discussion')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'discussion'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Group Discussion</span>
          </button>
        </div>
      </div>

      {/* TAB 1: CONTENT (FOLDERS, CLASSES & MATERIALS) */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          {/* Breadcrumb Path & Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 text-xs text-slate-500 overflow-x-auto">
              {getBreadcrumbs().map((crumb, idx, arr) => (
                <React.Fragment key={crumb.id || 'root'}>
                  <button
                    onClick={() => {
                      if (!crumb.id) {
                        setCurrentFolderId(null);
                        setCurrentClass(null);
                      } else if (crumb.isClass) {
                        // already in class
                      } else {
                        setCurrentFolderId(crumb.id);
                        setCurrentClass(null);
                      }
                    }}
                    className={`hover:text-blue-500 whitespace-nowrap cursor-pointer ${
                      idx === arr.length - 1
                        ? 'font-bold text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {crumb.name}
                  </button>
                  {idx < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                </React.Fragment>
              ))}
            </div>

            {/* Admin Action Buttons */}
            {role === 'admin' && (
              <div className="flex items-center gap-2 shrink-0">
                {currentClass ? (
                  /* Inside a Class: NO Add Folder! Only Add Materials! */
                  <button
                    onClick={() => setShowAddResourceModal(true)}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Material</span>
                  </button>
                ) : (
                  /* In Root or Folder: Add Folder & Add Class */
                  <>
                    <button
                      onClick={() => setShowAddFolderModal(true)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Add Folder</span>
                    </button>
                    <button
                      onClick={() => setShowAddClassModal(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                    >
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>Add Class</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* VIEW: INSIDE A CLASS */}
          {currentClass ? (
            <div className="space-y-6">
              {/* Class Header Banner */}
              <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                        {currentClass.title}
                      </h3>
                      {role === 'admin' && (
                        <button
                          onClick={() => {
                            setRenameTargetClass(currentClass);
                            setRenameClassTitleVal(currentClass.title);
                          }}
                          className="p-1 text-slate-400 hover:text-blue-500 rounded"
                          title="Rename Class"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {resources.filter(r => r.classId === currentClass.id && r.type === 'video').length} Videos • {resources.filter(r => r.classId === currentClass.id && r.type === 'pdf').length} PDF Lecture Notes
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {role === 'admin' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setResourceType('video');
                          setShowAddResourceModal(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>+ Add Video</span>
                      </button>
                      <button
                        onClick={() => {
                          setResourceType('pdf');
                          setShowAddResourceModal(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>+ Add PDF</span>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setCurrentClass(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer"
                  >
                    Back to Classes
                  </button>
                </div>
              </div>

              {/* SECTION 1 (TOP): CLASS VIDEOS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Video className="w-4 h-4 text-blue-500" />
                    <span>Class Video Lectures ({currentClassMaterials.filter(r => r.type === 'video').length})</span>
                  </h4>
                  {role === 'admin' && (
                    <button
                      onClick={() => {
                        setResourceType('video');
                        setShowAddResourceModal(true);
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Video</span>
                    </button>
                  )}
                </div>

                {currentClassMaterials.filter(r => r.type === 'video').length === 0 ? (
                  <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center text-slate-400">
                    <Video className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                    <p className="text-xs font-medium">No video lectures added yet for this class.</p>
                    {role === 'admin' && (
                      <button
                        onClick={() => {
                          setResourceType('video');
                          setShowAddResourceModal(true);
                        }}
                        className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-semibold underline cursor-pointer"
                      >
                        + Add First Video Lecture
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {currentClassMaterials.filter(r => r.type === 'video').map((res) => (
                      <div
                        key={res.id}
                        onClick={() => setActiveVideo({ title: res.title, url: res.url })}
                        className="group p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/60 dark:hover:border-blue-500/60 rounded-2xl transition-all shadow-xs hover:shadow-md cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                              Video Lecture
                            </span>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                              {res.title}
                            </h4>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:underline hidden sm:inline">
                            Watch
                          </span>
                          {role === 'admin' && (
                            <button
                              onClick={(e) => handleDeleteResource(res, e)}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Delete Video"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2 (BOTTOM): CLASS PDFS */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-rose-500" />
                    <span>Class Notes & PDFs ({currentClassMaterials.filter(r => r.type === 'pdf').length})</span>
                  </h4>
                  {role === 'admin' && (
                    <button
                      onClick={() => {
                        setResourceType('pdf');
                        setShowAddResourceModal(true);
                      }}
                      className="text-xs text-rose-600 dark:text-rose-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add PDF</span>
                    </button>
                  )}
                </div>

                {currentClassMaterials.filter(r => r.type === 'pdf').length === 0 ? (
                  <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                    <p className="text-xs font-medium">No PDF lecture sheets added yet for this class.</p>
                    {role === 'admin' && (
                      <button
                        onClick={() => {
                          setResourceType('pdf');
                          setShowAddResourceModal(true);
                        }}
                        className="mt-2 text-xs text-rose-600 dark:text-rose-400 font-semibold underline cursor-pointer"
                      >
                        + Add First PDF Lecture Note
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {currentClassMaterials.filter(r => r.type === 'pdf').map((res) => (
                      <div
                        key={res.id}
                        onClick={() => setActivePdf({ title: res.title, url: res.url })}
                        className="group p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-500/60 dark:hover:border-rose-500/60 rounded-2xl transition-all shadow-xs hover:shadow-md cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                              PDF Note / Sheet
                            </span>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                              {res.title}
                            </h4>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 group-hover:underline hidden sm:inline">
                            View PDF
                          </span>
                          {role === 'admin' && (
                            <button
                              onClick={(e) => handleDeleteResource(res, e)}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Delete PDF"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* VIEW: FOLDERS & CLASSES LIST */
            <div className="space-y-6">
              {/* Folders Section */}
              {visibleFolders.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Folders ({visibleFolders.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleFolders.map((folder) => (
                      <div
                        key={folder.id}
                        onClick={() => setCurrentFolderId(folder.id)}
                        className="group p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 rounded-2xl transition-all shadow-xs hover:shadow-md cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <FolderIcon className="w-5 h-5 fill-current opacity-80" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                              {folder.name}
                            </h4>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Folder
                            </span>
                          </div>
                        </div>

                        {role === 'admin' && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameTargetFolder(folder);
                                setRenameFolderNameVal(folder.name);
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Rename Folder"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteFolder(folder, e)}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Delete Folder"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Classes Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Classes ({visibleClasses.length})
                </h4>
                {visibleClasses.length === 0 ? (
                  visibleFolders.length === 0 && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                      <GraduationCap className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                      <p className="text-sm font-medium">No folders or classes created yet.</p>
                      {role === 'admin' && (
                        <p className="text-xs text-slate-500 mt-1">Use "Add Folder" or "Add Class" above to organize your course lectures.</p>
                      )}
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleClasses.map((cClass) => (
                      <div
                        key={cClass.id}
                        onClick={() => setCurrentClass(cClass)}
                        className="group p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/60 dark:hover:border-blue-500/60 rounded-2xl transition-all shadow-xs hover:shadow-md cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                            <GraduationCap className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                              {cClass.title}
                            </h4>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              Enter Class <ChevronRight className="w-3 h-3 text-blue-500" />
                            </span>
                          </div>
                        </div>

                        {role === 'admin' && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameTargetClass(cClass);
                                setRenameClassTitleVal(cClass.title);
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Rename Class"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteClass(cClass, e)}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Delete Class"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MEMBERS */}
      {activeTab === 'members' && (
        <CourseMembers course={course} students={students} />
      )}

      {/* TAB 3: DISCUSSION ROOM */}
      {activeTab === 'discussion' && (
        <DiscussionRoom courseId={course.id} courseName={course.name} />
      )}

      {/* MODAL: ADD FOLDER */}
      {showAddFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              Create New Folder
            </h4>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Chapter 01 - Dynamics"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddFolderModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CLASS */}
      {showAddClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              Create New Class
            </h4>
            <form onSubmit={handleCreateClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Class Title
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newClassTitle}
                  onChange={(e) => setNewClassTitle(e.target.value)}
                  placeholder="e.g. Class 01: Vector Fundamentals"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddClassModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Create Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RENAME FOLDER */}
      {renameTargetFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              Rename Folder
            </h4>
            <form onSubmit={handleRenameFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={renameFolderNameVal}
                  onChange={(e) => setRenameFolderNameVal(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameTargetFolder(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RENAME CLASS */}
      {renameTargetClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              Rename Class
            </h4>
            <form onSubmit={handleRenameClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Class Title
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={renameClassTitleVal}
                  onChange={(e) => setRenameClassTitleVal(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameTargetClass(null)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD MATERIAL (CLASS VIDEO OR CLASS NOTE) */}
      {showAddResourceModal && currentClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              Add Material to {currentClass.title}
            </h4>
            <form onSubmit={handleCreateResource} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Material Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResourceType('video')}
                    className={`py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                      resourceType === 'video'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Video className="w-4 h-4" /> Class Video
                  </button>
                  <button
                    type="button"
                    onClick={() => setResourceType('pdf')}
                    className={`py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer ${
                      resourceType === 'pdf'
                        ? 'bg-red-50 dark:bg-red-950/60 border-red-600 text-red-600 dark:text-red-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <FileText className="w-4 h-4" /> Class Note (PDF)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={resourceTitle}
                  onChange={(e) => setResourceTitle(e.target.value)}
                  placeholder={resourceType === 'video' ? 'e.g. Vector Analysis - Lecture 01' : 'e.g. Chapter 01 Class Notes PDF'}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {resourceType === 'video' ? 'YouTube Video Link' : 'Google Drive / PDF Link'}
                </label>
                <input
                  type="url"
                  required
                  value={resourceUrl}
                  onChange={(e) => setResourceUrl(e.target.value)}
                  placeholder={resourceType === 'video' ? 'https://www.youtube.com/watch?v=...' : 'https://drive.google.com/file/d/...'}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddResourceModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Add Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIDEO PLAYER MODAL */}
      {activeVideo && (
        <ProtectedVideoPlayer
          title={activeVideo.title}
          url={activeVideo.url}
          onClose={() => setActiveVideo(null)}
        />
      )}

      {/* PDF VIEWER MODAL */}
      {activePdf && (
        <PdfViewerModal
          title={activePdf.title}
          url={activePdf.url}
          onClose={() => setActivePdf(null)}
        />
      )}
    </div>
  );
};
