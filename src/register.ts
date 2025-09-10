import { addAlias } from 'module-alias';
import { join } from 'path';

// Add path aliases - go up one level from src directory
addAlias('@', join(__dirname, '..'));