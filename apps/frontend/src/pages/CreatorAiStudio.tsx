import { useState } from 'react';
import { CreatorLayout } from '@/features/creator/components/CreatorLayout';
import StudioMapEditor from '@/components/studio/StudioMapEditor';

export default function CreatorAiStudio() {
  return (
    <CreatorLayout>
      <div className="w-full h-[calc(100vh-80px)] flex flex-col mt-4">
        <StudioMapEditor />
      </div>
    </CreatorLayout>
  );
}
