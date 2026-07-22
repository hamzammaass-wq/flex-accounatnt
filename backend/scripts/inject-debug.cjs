const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../contexts/AccountingContext.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const debugCode = `
  const debugPrevStatesRef = useRef<any>({});
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentStates = { 
        currentUserRole: currentUser?.role, 
        currentUserId: currentUser?.id,
        usersLength: users.length, 
        users0Role: users[0]?.role,
        companiesLength: companies.length, 
        currentCompanyId, 
        cloudMembershipsLength: cloudMemberships.length, 
        subscriptionAdminRole, 
        programOwnerEnabled,
        workspaceOfferCodesLength: workspaceOfferCodes.length
      };
      
      const changed = [];
      for (const key in currentStates) {
        if (currentStates[key] !== debugPrevStatesRef.current[key]) {
          changed.push(key + ' (was ' + debugPrevStatesRef.current[key] + ' now ' + currentStates[key] + ')');
        }
      }
      
      if (changed.length > 0) {
        let div = document.getElementById('agy-debug-log');
        if (!div) {
          div = document.createElement('div');
          div.id = 'agy-debug-log';
          div.style.position = 'fixed';
          div.style.top = '0';
          div.style.left = '0';
          div.style.width = '100vw';
          div.style.height = '100vh';
          div.style.zIndex = '9999999';
          div.style.background = 'rgba(0,0,0,0.8)';
          div.style.color = 'lime';
          div.style.padding = '20px';
          div.style.fontSize = '16px';
          div.style.overflowY = 'auto';
          div.style.direction = 'ltr';
          document.body.appendChild(div);
        }
        
        const line = document.createElement('div');
        line.innerText = new Date().toISOString() + ': CHANGED: ' + changed.join(', ');
        div.appendChild(line);
        
        if (div.childNodes.length > 100) {
           div.removeChild(div.firstChild!);
        }
      }
      debugPrevStatesRef.current = currentStates;
    }
  });
`;

if (!content.includes('agy-debug-log')) {
  // Inject at the beginning of the component, just after the first hook
  const insertIndex = content.indexOf('const [isAuthInitialized, setIsAuthInitialized] = useState(false);');
  if (insertIndex !== -1) {
    content = content.slice(0, insertIndex) + debugCode + '\n  ' + content.slice(insertIndex);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Injected debug code.');
  } else {
    console.error('Could not find injection point.');
  }
} else {
  console.log('Debug code already injected.');
}
