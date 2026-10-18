import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Course, Folder, CourseClass, MediaResource, StudentUser, PdfCategory } from '../../types';
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
import { extractYouTubeId, getYouTubeThumbnail, isYouTubeUrl } from '../../utils/mediaUrl';
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
  Play,
  User,
  ExternalLink,
  Maximize,
  Sparkles,
  BookMarked,
  CheckCircle2,
  Download
} from 'lucide-react';

interface CourseViewProps {
  course: Course;
  students: StudentUser[];
  onBack: () => void;
  registerBackHandler?: (handler: () => boolean) => void;
}

export const CourseView: React.FC<CourseViewProps> = ({ 
  course, 
  students, 
  onBack,
  registerBackHandler
}) => {
  const { role } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<'content' | 'members' | 'discussion'>('content');

  // Hierarchy Navigation
  const [folders, setFolders] = useState<Folder[]>([]);
  const [classes, setClasses] = useState<CourseClass[]>([]);
  const [resources, setResources] = useState<MediaResource[]>([]);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentClass, setCurrentClass] = useState<CourseClass | null>(null);

  // Class view state (Matching Screenshot 1)
  const [activeVideoId, setActiveVideoId] = useState<string>('');
  const [selectedMaterialCategory, setSelectedMaterialCategory] = useState<PdfCategory>('lecture');
  const [activePdfResource, setActivePdfResource] = useState<MediaResource | null>(null);

  // Modals
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [newClassTitle, setNewClassTitle] = useState('');
  const [newClassInstructor, setNewClassInstructor] = useState('Dr Tofael Ahmed');

  // Rename Modals
  const [renameTargetFolder, setRenameTargetFolder] = useState<Folder | null>(null);
  const [renameFolderNameVal, setRenameFolderNameVal] = useState('');

  const [renameTargetClass, setRenameTargetClass] = useState<CourseClass | null>(null);
  const [renameClassTitleVal, setRenameClassTitleVal] = useState('');
  const [renameClassInstructorVal, setRenameClassInstructorVal] = useState('');

  // Add Material Modal (Video / Note)
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [resourceType, setResourceType] = useState<'video' | 'pdf'>('video');
  const [uploadMode, setUploadMode] = useState<'link' | 'file'>('link');
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceCategory, setResourceCategory] = useState<PdfCategory>('lecture');
  const [resourceInstructor, setResourceInstructor] = useState('Dr Tofael Ahmed');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Fullscreen modals
  const [activeVideoPopup, setActiveVideoPopup] = useState<{ title: string; url: string } | null>(null);
  const [activePdfPopup, setActivePdfPopup] = useState<{ title: string; url: string } | null>(null);

  // Register 1-step backward navigation handler with App.tsx
  useEffect(() => {
    if (registerBackHandler) {
      registerBackHandler(() => {
        if (activeVideoPopup) {
          setActiveVideoPopup(null);
          return true;
        }
        if (activePdfPopup) {
          setActivePdfPopup(null);
          return true;
        }
        if (showAddResourceModal) {
          setShowAddResourceModal(false);
          return true;
        }
        if (showAddClassModal) {
          setShowAddClassModal(false);
          return true;
        }
        if (showAddFolderModal) {
          setShowAddFolderModal(false);
          return true;
        }
        if (renameTargetFolder) {
          setRenameTargetFolder(null);
          return true;
        }
        if (renameTargetClass) {
          setRenameTargetClass(null);
          return true;
        }
        if (currentClass) {
          setCurrentClass(null);
          return true;
        }
        if (currentFolderId) {
          const curr = folders.find(f => f.id === currentFolderId);
          setCurrentFolderId(curr?.parentId || null);
          return true;
        }
        if (activeTab !== 'content') {
          setActiveTab('content');
          return true;
        }
        return false;
      });
    }
  }, [
    registerBackHandler,
    activeVideoPopup,
    activePdfPopup,
    showAddResourceModal,
    showAddClassModal,
    showAddFolderModal,
    renameTargetFolder,
    renameTargetClass,
    currentClass,
    currentFolderId,
    folders,
    activeTab
  ]);

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

  // Sync currentClass with database updates
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

  const classVideos = currentClassMaterials.filter(r => r.type === 'video');
  const classPdfs = currentClassMaterials.filter(r => r.type === 'pdf');

  // Currently playing video for the class
  const activeVideoResource = classVideos.find(v => v.id === activeVideoId) || classVideos[0];

  // PDFs for the selected category chip (Lecture / Practice / Solution / Marked Book)
  const categoryPdfs = classPdfs.filter(p => (p.category || 'lecture') === selectedMaterialCategory);
  const selectedPdf = activePdfResource || categoryPdfs[0];

  // Convert Google Drive sharing link to preview embed format
  const getEmbeddablePdfUrl = (rawUrl: string): string => {
    try {
      if (rawUrl.includes('drive.google.com')) {
        const fileIdMatch = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || rawUrl.match(/id=([a-zA-Z0-9_-]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
          return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
        }
      }
      return rawUrl;
    } catch {
      return rawUrl;
    }
  };

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
      const created = await createClass(course.id, title, currentFolderId, newClassInstructor.trim());
      toastSuccess(`Class "${title}" created.`);
      window.history.pushState({ type: 'class', id: created.id }, '');
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
    const newInst = renameClassInstructorVal.trim();

    setRenameTargetClass(null);
    setRenameClassTitleVal('');
    setRenameClassInstructorVal('');

    try {
      await updateClassTitle(targetId, newTitle, newInst);
      toastSuccess(`Class updated to "${newTitle}".`);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to rename class');
    }
  };

  // Handle file selection from local device (Video or PDF)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    // If title is blank, auto-populate with file name without extension
    if (!resourceTitle.trim()) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setResourceTitle(nameWithoutExt);
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setResourceUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Create Resource under Current Class (Name is completely optional, URL or file supported)
  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClass) return;

    let finalUrl = resourceUrl.trim();
    if (!finalUrl) {
      toastError(resourceType === 'video' ? 'Please provide a video URL or select a file.' : 'Please provide a PDF URL or select a file.');
      return;
    }

    // Check if input is a YouTube video
    if (resourceType === 'video') {
      const ytId = extractYouTubeId(finalUrl);
      if (ytId) {
        // Standardize clean YouTube URL
        finalUrl = `https://www.youtube.com/watch?v=${ytId}`;
      } else if (!finalUrl.startsWith('data:') && !finalUrl.startsWith('blob:') && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
      }
    } else {
      if (!finalUrl.startsWith('data:') && !finalUrl.startsWith('blob:') && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
      }
    }

    // Check if base64 file data exceeds Firestore 1MB limit
    if (finalUrl.startsWith('data:') && finalUrl.length > 950000) {
      toastError(
        resourceType === 'video'
          ? 'The video file is too large for database storage. Please upload the video to YouTube (Unlisted) or Google Drive and paste the link.'
          : 'The PDF file is too large. Please paste a Google Drive or cloud PDF link.'
      );
      return;
    }

    // Auto-generate title if omitted
    let finalTitle = resourceTitle.trim();
    if (!finalTitle) {
      if (resourceType === 'video') {
        const ytId = extractYouTubeId(finalUrl);
        finalTitle = ytId ? `Video Lecture ${classVideos.length + 1}` : `Class Lecture ${classVideos.length + 1}`;
      } else {
        if (resourceCategory === 'lecture') finalTitle = `Lecture Sheet - ${currentClass.title}`;
        else if (resourceCategory === 'practice') finalTitle = `Practice Sheet - ${currentClass.title}`;
        else if (resourceCategory === 'solution') finalTitle = `Solution Sheet - ${currentClass.title}`;
        else finalTitle = `Marked Book - ${currentClass.title}`;
      }
    }

    setIsUploading(true);
    try {
      await createResource(
        course.id, 
        finalTitle, 
        resourceType, 
        finalUrl, 
        currentFolderId, 
        currentClass.id,
        resourceType === 'pdf' ? resourceCategory : undefined,
        resourceInstructor.trim() || undefined
      );
      toastSuccess(`${resourceType === 'video' ? 'Video lecture' : 'Class sheet'} added successfully.`);
      setShowAddResourceModal(false);
      setResourceTitle('');
      setResourceUrl('');
      setSelectedFileName('');
      setUploadMode('link');
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to upload material');
    } finally {
      setIsUploading(false);
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
    if (window.confirm(`Delete class "${cClass.title}" and its materials?`)) {
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
        if (activeVideoId === res.id) setActiveVideoId('');
        if (activePdfResource?.id === res.id) setActivePdfResource(null);
        toastSuccess(`Material "${res.title}" deleted.`);
      } catch (err: unknown) {
        toastError(err instanceof Error ? err.message : 'Failed to delete material');
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 pb-24 space-y-6">
      {/* Top Navigation Bar & Course Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (currentClass) {
                setCurrentClass(null);
              } else if (currentFolderId) {
                const curr = folders.find(f => f.id === currentFolderId);
                setCurrentFolderId(curr?.parentId || null);
              } else {
                onBack();
              }
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-0.5 rounded-md badge-theme font-bold">
                {course.batch}
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {course.name}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Educational workspace • Classes, Lecture Sheets, Question Solves & Discussion
            </p>
          </div>
        </div>

        {/* Tab Selector: Content, Members, Discussion */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#121622] rounded-xl self-start sm:self-auto border border-slate-200 dark:border-white/[0.08]">
          <button
            onClick={() => setActiveTab('content')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'content'
                ? 'btn-theme-primary shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Class Content</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'members'
                ? 'btn-theme-primary shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Enrolled Students</span>
          </button>

          <button
            onClick={() => setActiveTab('discussion')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'discussion'
                ? 'btn-theme-primary shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Discussion</span>
          </button>
        </div>
      </div>

      {/* TAB 1: CONTENT HIERARCHY & CLASS VIEW */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 overflow-x-auto pb-1">
            {getBreadcrumbs().map((crumb, idx, arr) => (
              <React.Fragment key={crumb.id || 'root'}>
                <button
                  onClick={() => {
                    if (crumb.isClass) return;
                    setCurrentClass(null);
                    setCurrentFolderId(crumb.id);
                  }}
                  className={`hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap cursor-pointer ${
                    idx === arr.length - 1 ? 'font-bold text-slate-900 dark:text-white' : ''
                  }`}
                >
                  {crumb.name}
                </button>
                {idx < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
              </React.Fragment>
            ))}
          </div>

          {/* VIEW: INSIDE A CLASS */}
          {currentClass ? (
            <div className="space-y-5">
              {/* BOX 1: VIDEO LECTURE PLAYER (STANDALONE 16px ROUNDED BOX) */}
              {activeVideoResource ? (
                <div 
                  className="overflow-hidden bg-black border border-slate-800 shadow-xl"
                  style={{ borderRadius: '16px' }}
                >
                  <ProtectedVideoPlayer
                    title={activeVideoResource.title}
                    url={activeVideoResource.url}
                    isInline={true}
                  />
                </div>
              ) : (
                <div 
                  className="p-10 text-center text-slate-500 dark:text-slate-400 space-y-3 bg-white/80 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 shadow-md backdrop-blur-md"
                  style={{ borderRadius: '16px' }}
                >
                  <Video className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-600" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No video lectures added to this class yet.</p>
                  {role === 'admin' && (
                    <button
                      onClick={() => {
                        setResourceType('video');
                        setShowAddResourceModal(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Video Lecture</span>
                    </button>
                  )}
                </div>
              )}

              {/* BOX 2: CLASS VIDEO PARTS PLAYLIST (SEPARATE STANDALONE 16px ROUNDED BOX) */}
              {classVideos.length > 0 && (
                <div 
                  className="p-4 sm:p-5 bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-md space-y-3"
                  style={{ borderRadius: '16px' }}
                >
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                        Class Video Lectures ({classVideos.length} {classVideos.length === 1 ? 'Part' : 'Parts'})
                      </h4>
                    </div>
                    {role === 'admin' && (
                      <button
                        onClick={() => {
                          setResourceType('video');
                          setShowAddResourceModal(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Video</span>
                      </button>
                    )}
                  </div>

                  {/* Vertically Listed Videos */}
                  <div className="space-y-2">
                    {classVideos.map((vid, idx) => {
                      const isCurrent = (activeVideoId || classVideos[0].id) === vid.id;
                      return (
                        <div
                          key={vid.id}
                          onClick={() => setActiveVideoId(vid.id)}
                          className={`group relative p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isCurrent
                              ? 'bg-blue-50/90 dark:bg-blue-950/50 border-blue-500 shadow-sm ring-1 ring-blue-500/30'
                              : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div 
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 shadow-xs ${
                                isCurrent
                                  ? 'text-white'
                                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                              style={isCurrent ? { backgroundColor: 'var(--theme-primary)' } : undefined}
                            >
                              <Play className={`w-4 h-4 ${isCurrent ? 'fill-current' : ''}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span 
                                  className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md font-mono"
                                  style={isCurrent ? { backgroundColor: 'var(--theme-primary-light)', color: 'var(--theme-primary)' } : { backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#64748b' }}
                                >
                                  Part {idx + 1}
                                </span>
                                {isCurrent && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>Playing Now</span>
                                  </span>
                                )}
                              </div>
                              <h5 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate mt-0.5">
                                {vid.title}
                              </h5>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveVideoId(vid.id);
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                isCurrent
                                  ? 'text-white shadow-xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                              }`}
                              style={isCurrent ? { backgroundColor: 'var(--theme-primary)' } : undefined}
                            >
                              {isCurrent ? 'Playing' : 'Play'}
                            </button>
                            {role === 'admin' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteResource(vid, e);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/60 transition-colors cursor-pointer"
                                title="Delete Video"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TITLE CARD */}
              <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 text-slate-900 dark:text-white shadow-md backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {currentClass.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                    <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>by {currentClass.instructor || 'Dr Tofael Ahmed'}</span>
                  </div>
                </div>

                {/* Admin Management Tools for Class */}
                {role === 'admin' && (
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      onClick={() => {
                        setResourceType('video');
                        setShowAddResourceModal(true);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>+ Video</span>
                    </button>
                    <button
                      onClick={() => {
                        setResourceType('pdf');
                        setShowAddResourceModal(true);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>+ PDF</span>
                    </button>
                    <button
                      onClick={(e) => handleDeleteClass(currentClass, e)}
                      className="p-2 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 hover:text-white cursor-pointer transition-colors"
                      title="Delete Class"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* CLASS MATERIALS SECTION (MATCHING SCREENSHOT 1) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span>CLASS MATERIALS</span>
                  </h4>
                  <span className="text-xs text-slate-400">
                    {classPdfs.length} Material(s) Available
                  </span>
                </div>

                {/* CATEGORY CHIP BUTTONS (MATCHING SCREENSHOT 1) */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {[
                    { id: 'lecture', label: '📖 Lecture', count: classPdfs.filter(p => (p.category || 'lecture') === 'lecture').length, activeClass: 'bg-blue-600 text-white' },
                    { id: 'practice', label: '📝 Practice', count: classPdfs.filter(p => p.category === 'practice').length, activeClass: 'bg-indigo-600 text-white' },
                    { id: 'solution', label: '📄 Solution', count: classPdfs.filter(p => p.category === 'solution').length, activeClass: 'bg-emerald-600 text-white' },
                    { id: 'marked_book', label: '📕 Marked Book', count: classPdfs.filter(p => p.category === 'marked_book').length, activeClass: 'bg-purple-600 text-white' },
                  ].map((cat) => {
                    const isSelected = selectedMaterialCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedMaterialCategory(cat.id as PdfCategory);
                          setActivePdfResource(null);
                        }}
                        className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0 border ${
                          isSelected
                            ? `${cat.activeClass} border-transparent shadow-md scale-102`
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{cat.label}</span>
                        {cat.count > 0 && (
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}>
                            {cat.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Category PDFs list & Embedded Viewer (MATCHING SCREENSHOT 1) */}
                {categoryPdfs.length === 0 ? (
                  <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-center text-slate-400 space-y-2">
                    <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                    <p className="text-xs sm:text-sm font-medium">No sheets uploaded in this category yet.</p>
                    {role === 'admin' && (
                      <button
                        onClick={() => {
                          setResourceType('pdf');
                          setResourceCategory(selectedMaterialCategory);
                          setShowAddResourceModal(true);
                        }}
                        className="mt-1 text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                      >
                        + Add PDF in this category
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Material Selector Bar if multiple in this category */}
                    {categoryPdfs.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        <span className="text-[11px] font-bold text-slate-400 shrink-0 uppercase tracking-wider">
                          Available Sheets:
                        </span>
                        {categoryPdfs.map((pdf) => (
                          <button
                            key={pdf.id}
                            onClick={() => setActivePdfResource(pdf)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer border ${
                              (selectedPdf?.id === pdf.id)
                                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-600 dark:text-blue-300 shadow-xs'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {pdf.title}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* EMBEDDED PDF SLIDES / VIEWER MATCHING SCREENSHOT 1 */}
                    {selectedPdf && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                        {/* Viewer Top Action Bar */}
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="p-1.5 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                              <FileText className="w-4 h-4" />
                            </span>
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                {selectedPdf.title}
                              </h4>
                              <span className="text-[10px] text-slate-500 font-medium">
                                Embedded Lecture Viewer
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <a
                              href={selectedPdf.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                              title="Download / Open Original"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Download</span>
                            </a>

                            <button
                              onClick={() => setActivePdfPopup({ title: selectedPdf.title, url: selectedPdf.url })}
                              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                              title="Full Screen Viewer"
                            >
                              <Maximize className="w-3.5 h-3.5" />
                              <span>Full Screen</span>
                            </button>

                            {role === 'admin' && (
                              <button
                                onClick={(e) => handleDeleteResource(selectedPdf, e)}
                                className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ml-1"
                                title="Delete PDF"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Document Viewer Frame */}
                        <div className="w-full h-[650px] bg-slate-100 dark:bg-black/90 relative">
                          <iframe
                            src={getEmbeddablePdfUrl(selectedPdf.url)}
                            className="w-full h-full border-none"
                            title={selectedPdf.title}
                            allowFullScreen
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* VIEW: FOLDERS & CLASSES LIST */
            <div className="space-y-6">
              {/* Admin Action Bar (Add Folder, Add Class) */}
              {role === 'admin' && (
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setShowAddFolderModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>Add Folder</span>
                  </button>

                  <button
                    onClick={() => setShowAddClassModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-theme-primary font-semibold text-xs sm:text-sm shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Class</span>
                  </button>
                </div>
              )}

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
                        onClick={() => {
                          window.history.pushState({ type: 'folder', id: folder.id }, '');
                          setCurrentFolderId(folder.id);
                        }}
                        className="group relative p-4 bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 card-theme-interactive rounded-2xl shadow-xs hover:shadow-xl cursor-pointer flex items-center justify-between overflow-hidden"
                      >
                        <div className="card-glow-line" />
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl theme-folder-icon flex items-center justify-center shrink-0 shadow-xs">
                            <FolderIcon className="w-5 h-5 fill-current opacity-90" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {folder.name}
                            </h4>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Folder • Tap to browse
                            </span>
                          </div>
                        </div>

                        {/* Delete & Rename buttons clearly visible for touch screens */}
                        {role === 'admin' && (
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameTargetFolder(folder);
                                setRenameFolderNameVal(folder.name);
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Rename Folder"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteFolder(folder, e)}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
                    <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-500 dark:text-slate-400 space-y-3 backdrop-blur-md">
                      <GraduationCap className="w-12 h-12 mx-auto text-blue-600 dark:text-blue-400 opacity-80" />
                      <div>
                        <p className="text-base font-bold text-slate-900 dark:text-white">No folders or classes created yet</p>
                        {role === 'admin' ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Create a class to start adding video lectures and class sheets.</p>
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">The instructor will add classes and lecture videos soon.</p>
                        )}
                      </div>
                      {role === 'admin' && (
                        <div className="pt-2 flex items-center justify-center gap-3">
                          <button
                            onClick={() => setShowAddClassModal(true)}
                            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-2 cursor-pointer shadow-md transition-all"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Create Class & Add Content</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleClasses.map((cClass) => (
                      <div
                        key={cClass.id}
                        onClick={() => {
                          window.history.pushState({ type: 'class', id: cClass.id }, '');
                          setCurrentClass(cClass);
                        }}
                        className="group relative p-4 bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 card-theme-interactive rounded-2xl shadow-xs hover:shadow-xl cursor-pointer flex items-center justify-between overflow-hidden"
                      >
                        <div className="card-glow-line" />
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl theme-folder-icon flex items-center justify-center shrink-0 shadow-xs">
                            <GraduationCap className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {cClass.title}
                            </h4>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              by {cClass.instructor || 'Dr Tofael Ahmed'} • <span className="font-semibold text-blue-600 dark:text-blue-400">Enter Class</span> <ChevronRight className="w-3 h-3 text-blue-500 group-hover:translate-x-1 transition-transform" />
                            </span>
                          </div>
                        </div>

                        {/* Delete & Rename buttons clearly visible for touch screens */}
                        {role === 'admin' && (
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameTargetClass(cClass);
                                setRenameClassTitleVal(cClass.title);
                                setRenameClassInstructorVal(cClass.instructor || 'Dr Tofael Ahmed');
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Rename Class"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteClass(cClass, e)}
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
            <form onSubmit={handleCreateClass} className="space-y-3.5">
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
                  placeholder="e.g. Introduction to Biology - Class 01"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Instructor Name
                </label>
                <input
                  type="text"
                  value={newClassInstructor}
                  onChange={(e) => setNewClassInstructor(e.target.value)}
                  placeholder="e.g. Dr Tofael Ahmed"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
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
              Edit Class Title & Instructor
            </h4>
            <form onSubmit={handleRenameClass} className="space-y-3.5">
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

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Instructor Name
                </label>
                <input
                  type="text"
                  value={renameClassInstructorVal}
                  onChange={(e) => setRenameClassInstructorVal(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
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

      {/* MODAL: ADD MATERIAL (VIDEO OR PDF WITH CATEGORY & OPTIONAL TITLE) */}
      {showAddResourceModal && currentClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h4 className="font-bold text-base text-slate-900 dark:text-white">
              Add Material to {currentClass.title}
            </h4>
            <form onSubmit={handleCreateResource} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Material Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResourceType('video')}
                    className={`py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      resourceType === 'video'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Video className="w-4 h-4" /> Class Video
                  </button>
                  <button
                    type="button"
                    onClick={() => setResourceType('pdf')}
                    className={`py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      resourceType === 'pdf'
                        ? 'bg-red-50 dark:bg-red-950/60 border-red-600 text-red-600 dark:text-red-400 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <FileText className="w-4 h-4" /> Class PDF / Sheet
                  </button>
                </div>
              </div>

              {/* If PDF, show Category Dropdown */}
              {resourceType === 'pdf' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Material Category
                  </label>
                  <select
                    value={resourceCategory}
                    onChange={(e) => setResourceCategory(e.target.value as PdfCategory)}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    <option value="lecture">📖 Lecture Sheet</option>
                    <option value="practice">📝 Practice Sheet</option>
                    <option value="solution">📄 Solution Sheet</option>
                    <option value="marked_book">📕 Marked Book</option>
                  </select>
                </div>
              )}

              {/* Title is optional: User can leave blank */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Title / Label
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">Optional</span>
                </div>
                <input
                  type="text"
                  value={resourceTitle}
                  onChange={(e) => setResourceTitle(e.target.value)}
                  placeholder={resourceType === 'video' ? 'Leave blank for auto-numbering (e.g. Video Lecture 1)' : 'Leave blank for default category title'}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Upload Source: Link or Device File */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Upload Source
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setUploadMode('link')}
                    className={`py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      uploadMode === 'link'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>🔗 Paste Link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMode('file')}
                    className={`py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      uploadMode === 'file'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>📁 Select File</span>
                  </button>
                </div>

                {uploadMode === 'link' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {resourceType === 'video' ? 'YouTube / Google Drive Link' : 'PDF Link'}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text) setResourceUrl(text.trim());
                          } catch {
                            // If clipboard permission is denied, focus input
                          }
                        }}
                        className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Paste from clipboard
                      </button>
                    </div>

                    <input
                      type="text"
                      required
                      value={resourceUrl}
                      onChange={(e) => setResourceUrl(e.target.value)}
                      placeholder={
                        resourceType === 'video'
                          ? 'Paste YouTube link (watch/youtu.be/shorts) or Google Drive link'
                          : 'Paste Google Drive or direct PDF link'
                      }
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    {/* LIVE YOUTUBE DETECTED PREVIEW */}
                    {resourceType === 'video' && extractYouTubeId(resourceUrl) && (
                      <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 flex items-center gap-3">
                        <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-black shrink-0 border border-slate-700">
                          <img
                            src={getYouTubeThumbnail(extractYouTubeId(resourceUrl)!)}
                            alt="YouTube Thumbnail"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Play className="w-4 h-4 fill-white text-white" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>YouTube Video Detected!</span>
                          </span>
                          <span className="block text-xs font-mono text-slate-600 dark:text-slate-400 truncate mt-0.5">
                            ID: {extractYouTubeId(resourceUrl)}
                          </span>
                        </div>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Supports YouTube (watch, youtu.be, shorts, embed), Google Drive, or MP4 URLs.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept={resourceType === 'video' ? 'video/*,.mp4,.webm,.mov' : '.pdf,application/pdf'}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                        {selectedFileName ? selectedFileName : (resourceType === 'video' ? 'Select video file from device' : 'Select PDF file from device')}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-0.5">
                        {resourceType === 'video' ? 'MP4, WebM, MOV supported' : 'PDF file supported'}
                      </span>
                    </label>

                    {resourceType === 'video' && (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                        <p className="font-bold">💡 Recommended for large videos:</p>
                        <p className="text-amber-700 dark:text-amber-400">
                          For high-speed, buffer-free playback, upload large video files to YouTube as <b>Unlisted</b> and paste the link.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => {
                    setShowAddResourceModal(false);
                    setSelectedFileName('');
                    setResourceUrl('');
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isUploading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{isUploading ? 'Uploading...' : 'Upload Material'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULLSCREEN POPUP PDF VIEWER */}
      {activePdfPopup && (
        <PdfViewerModal
          title={activePdfPopup.title}
          url={activePdfPopup.url}
          onClose={() => setActivePdfPopup(null)}
        />
      )}
    </div>
  );
};
