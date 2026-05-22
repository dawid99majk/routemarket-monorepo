import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileBalance } from '@/hooks/use-profile-balance';
import { TopUpModal } from '@/components/ui/TopUpModal';
import { Sparkles, Loader2, Files, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

// Custom Hooks
import { useAtlasApi } from '@/hooks/useAtlasApi';
import { useAtlasProjects } from '@/hooks/useAtlasProjects';
import { useAtlasProjectWorkspace } from '@/hooks/useAtlasProjectWorkspace';
import { useAtlasPipeline } from '@/hooks/useAtlasPipeline';
import { useAtlasFiles } from '@/hooks/useAtlasFiles';

// Components
import { CreatorProjectList } from '@/components/atlas-studio/CreatorProjectList';
import { CreatorProjectHeader } from '@/components/atlas-studio/CreatorProjectHeader';
import { CreatorStepNavigation } from '@/components/atlas-studio/CreatorStepNavigation';
import { CreatorNewProjectForm } from '@/components/atlas-studio/CreatorNewProjectForm';
import { SourceMaterialsStep } from '@/components/atlas-studio/SourceMaterialsStep';
import { InterviewStep } from '@/components/atlas-studio/InterviewStep';
import { ClaimsReviewStep } from '@/components/atlas-studio/ClaimsReviewStep';
import { GpxReviewStep } from '@/components/atlas-studio/GpxReviewStep';
import { ConceptReviewStep } from '@/components/atlas-studio/ConceptReviewStep';
import { GuideOutlineStep } from '@/components/atlas-studio/GuideOutlineStep';
import { GuideFinalStep } from '@/components/atlas-studio/GuideFinalStep';
import { MediaStep } from '@/components/atlas-studio/MediaStep';
import { PublishStep } from '@/components/atlas-studio/PublishStep';

import { PipelineStep, Project } from '@/types/atlas-types';

export default function CreatorAiStudio() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { balance, spendCredits } = useProfileBalance(user?.id);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);

  // Project Management
  const [activeSlug, setActiveSlug] = useState<string | null>(() => localStorage.getItem('creator_ai_studio_slug'));
  const { projects, loading: loadingProjects, fetchProjects, createProject: apiCreateProject } = useAtlasProjects();

  // Workspace & Pipeline
  const { 
    project, 
    loading: loadingDetails, 
    activeStep, 
    setActiveStep, 
    artifacts, 
    fetchWorkspace,
    events
  } = useAtlasProjectWorkspace(activeSlug);

  const { running: pipelineRunning, statusText, runPipeline, approveStage } = useAtlasPipeline();
  const { uploading, links, setLinks, uploadedFiles, setUploadedFiles, addLink, uploadFiles, saveNotes } = useAtlasFiles(activeSlug);

  useEffect(() => {
    if (!activeSlug) {
      fetchProjects();
    } else {
      fetchWorkspace();
    }
  }, [activeSlug, fetchProjects, fetchWorkspace]);

  const handleSelectProject = (slug: string) => {
    localStorage.setItem('creator_ai_studio_slug', slug);
    setActiveSlug(slug);
    setShowNewProjectForm(false);
  };

  const handleExitProject = () => {
    localStorage.removeItem('creator_ai_studio_slug');
    setActiveSlug(null);
    fetchProjects();
  };

  const handleCreateProject = async (params: any) => {
    try {
      const cost = params.deepResearch ? 50 : 25;
      await spendCredits.mutateAsync({
        amount: cost,
        purpose: params.deepResearch ? 'route_deep_research' : 'route_creation'
      });

      const newProject = await apiCreateProject(params);
      handleSelectProject(newProject.id);
    } catch (err) {
      // Error handled in hook
    }
  };

  const maxAllowedStep = useMemo<PipelineStep>(() => {
    if (!project) return 'sources';
    const status = project.status;
    const waitingStage = project.waitingApprovalStage;

    if (status === 'created' || status === 'research_needed') return 'sources';
    if (status === 'paused' || status === 'running') {
      if (waitingStage === 'interview_needed') return 'interview';
      if (waitingStage === 'claims_approval') return 'interview'; // Review after research
      if (waitingStage === 'gpx_summary_approval') return 'gpx';
      if (waitingStage === 'guide_outline_approval') return 'outline';
      if (waitingStage === 'guide_final_approval') return 'guide';
      return 'sources';
    }
    if (status === 'draft_generated' || status === 'completed') return 'publish';
    return 'sources';
  }, [project]);

  // Main Render Logic
  if (!activeSlug) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-50">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
            <Logo size="sm" />
            <Button onClick={() => navigate('/creator-dashboard')} variant="outline" size="sm">
              Panel twórcy
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-12 space-y-12">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight flex items-center justify-center gap-3">
              <Sparkles className="h-10 w-10 text-primary animate-pulse" />
              Magic AI Route Studio
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Twórz profesjonalne trasy turystyczne w asyście najbardziej zaawansowanego silnika AI na rynku.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Twoje Projekty</h2>
                {!showNewProjectForm && (
                  <Button onClick={() => setShowNewProjectForm(true)} size="sm" className="gap-2">
                    <Sparkles className="w-4 h-4" /> Nowa trasa
                  </Button>
                )}
              </div>
              
              <CreatorProjectList 
                projects={projects} 
                loading={loadingProjects} 
                activeSlug={activeSlug}
                onSelectProject={handleSelectProject}
                onCreateNew={() => setShowNewProjectForm(true)}
              />
            </div>

            <div className="space-y-8">
              {showNewProjectForm ? (
                <div className="sticky top-24">
                  <CreatorNewProjectForm 
                    balance={balance?.credit_balance ?? 100}
                    onTopUp={() => setIsTopUpOpen(true)}
                    onCreate={handleCreateProject}
                    isCreating={loadingProjects}
                  />
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowNewProjectForm(false)}
                    className="w-full mt-4"
                  >
                    Anuluj i wróć do listy
                  </Button>
                </div>
              ) : (
                <Card className="border-primary/10 bg-primary/[0.02]">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-bold">Jak to działa?</h3>
                    <ul className="space-y-4 text-sm">
                      <li className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</div>
                        <p className="text-muted-foreground">Wgrywasz linki, notatki lub pliki GPX.</p>
                      </li>
                      <li className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</div>
                        <p className="text-muted-foreground">AI przeprowadza z Tobą wywiad, aby doprecyzować detale.</p>
                      </li>
                      <li className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</div>
                        <p className="text-muted-foreground">Gemini bada źródła i generuje kompletną trasę.</p>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
        <TopUpModal open={isTopUpOpen} onOpenChange={setIsTopUpOpen} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Logo size="sm" />
            <div className="h-4 w-px bg-border hidden sm:block" />
            <span className="text-xs font-medium text-muted-foreground hidden sm:block uppercase tracking-widest">
              AI Studio Workspace
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-bold">{balance?.credit_balance ?? 0} Kredytów</span>
            </div>
            <Button onClick={handleExitProject} variant="ghost" size="sm">Wyjdź</Button>
          </div>
        </div>
      </header>

      {pipelineRunning && (
        <div className="bg-primary text-primary-foreground py-2 px-4 text-center text-xs font-medium animate-pulse sticky top-16 z-40">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{statusText}</span>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-8">
        {loadingDetails ? (
          <div className="flex flex-col items-center justify-center py-40">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-6" />
            <h2 className="text-xl font-bold">Inicjalizacja Przestrzeni Roboczej...</h2>
            <p className="text-muted-foreground">Ładujemy artefakty i stan projektu.</p>
          </div>
        ) : project && (
          <>
            <CreatorProjectHeader 
              project={project} 
              onExit={handleExitProject}
              onRefresh={fetchWorkspace}
              isRefreshing={loadingDetails}
            />

            <CreatorStepNavigation 
              activeStep={activeStep}
              maxAllowedStep={maxAllowedStep}
              onStepClick={(step) => setActiveStep(step)}
            />

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
              <div className="xl:col-span-3 space-y-6">
                {activeStep === 'sources' && (
                  <SourceMaterialsStep 
                    notes={artifacts.notes}
                    onNotesChange={artifacts.setNotes}
                    onSaveNotes={() => saveNotes(artifacts.notes)}
                    links={links}
                    onAddLink={addLink}
                    uploadedFiles={uploadedFiles}
                    onUploadFiles={uploadFiles}
                    isUploading={uploading}
                    onContinue={() => runPipeline(activeSlug, fetchWorkspace)}
                  />
                )}

                {activeStep === 'interview' && (
                  <InterviewStep 
                    project={project}
                    onComplete={fetchWorkspace}
                  />
                )}

                {/* Human-in-the-loop Review Steps */}
                {project.waitingApprovalStage === 'claims_approval' && activeStep === 'interview' && (
                   <ClaimsReviewStep 
                    claims={artifacts.claims}
                    onApprove={() => approveStage(activeSlug, 'claims_approval')}
                    isProcessing={pipelineRunning}
                   />
                )}

                {activeStep === 'gpx' && (
                  <GpxReviewStep 
                    gpxXml={artifacts.gpxXml}
                    onApprove={() => approveStage(activeSlug, 'gpx_summary_approval')}
                    isProcessing={pipelineRunning}
                  />
                )}

                {activeStep === 'outline' && (
                  <GuideOutlineStep 
                    outline={artifacts.outline}
                    onApprove={() => approveStage(activeSlug, 'guide_outline_approval')}
                    isProcessing={pipelineRunning}
                  />
                )}

                {activeStep === 'guide' && (
                  <GuideFinalStep 
                    guide={artifacts.guide}
                    onApprove={() => approveStage(activeSlug, 'guide_final_approval')}
                    isProcessing={pipelineRunning}
                  />
                )}

                {activeStep === 'media' && (
                  <MediaStep 
                    poiGeoJson={artifacts.poiGeoJson}
                    onApprove={() => setActiveStep('publish')}
                    isProcessing={pipelineRunning}
                  />
                )}

                {activeStep === 'publish' && (
                  <PublishStep 
                    project={project}
                    onViewPublic={() => navigate(`/route/${project.id}`)}
                  />
                )}
              </div>

              <div className="space-y-6">
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Files className="w-4 h-4" /> Logi AI
                    </h3>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {events.map((event, idx) => (
                        <div key={idx} className="text-[11px] leading-relaxed p-2 rounded bg-muted/30 border-l-2 border-primary/50">
                          <span className="text-muted-foreground block mb-0.5">{new Date(event.createdAt as string).toLocaleTimeString()}</span>
                          <span className="font-medium">{event.message}</span>
                        </div>
                      ))}
                      {events.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">Brak nowych zdarzeń.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </main>
      <TopUpModal open={isTopUpOpen} onOpenChange={setIsTopUpOpen} />
    </div>
  );
}
