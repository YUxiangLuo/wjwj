export interface StudentAddFormState {
    id: string;
    name: string;
    email: string;
}

export function isStudentAddFormComplete(form: StudentAddFormState) {
    return Boolean(form.id.trim() && form.name.trim());
}
