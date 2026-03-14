interface CardBackProps {
  skin?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-10 h-14',
  md: 'w-14 h-20',
  lg: 'w-16 h-24',
};

const SKIN_STYLES: Record<string, string> = {
  classic: 'bg-blue-900 border-blue-700',
  ocean: 'bg-cyan-900 border-cyan-700',
  midnight: 'bg-indigo-950 border-indigo-700',
  'gold-foil': 'bg-yellow-900 border-yellow-600',
};

export default function CardBack({ skin = 'classic', size = 'md', className = '' }: CardBackProps) {
  const sizeClass = SIZE_CLASSES[size];
  const skinStyle = SKIN_STYLES[skin] ?? SKIN_STYLES.classic;

  return (
    <div className={`${sizeClass} rounded-lg card-shadow border-2 ${skinStyle} flex items-center justify-center ${className}`}>
      <div className="w-3/4 h-3/4 rounded border opacity-50 border-current flex items-center justify-center text-current text-xl opacity-60">
        ✦
      </div>
    </div>
  );
}
