interface IconProps {
  className?: string;
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 4.5H13M6.5 4.5V2.8C6.5 2.5 6.7 2.3 7 2.3H9C9.3 2.3 9.5 2.5 9.5 2.8V4.5M11.5 4.5V12.5C11.5 12.9 11.2 13.2 10.8 13.2H5.2C4.8 13.2 4.5 12.9 4.5 12.5V4.5H11.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
