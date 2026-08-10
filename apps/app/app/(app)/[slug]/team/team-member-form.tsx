"use client";

import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useId, useState } from "react";

export type TeamMemberValue = {
	name: string;
	email: string | null;
	role: string | null;
	status: "ACTIVE" | "INACTIVE";
	employmentType: "EMPLOYEE" | "CONTRACTOR" | "AGENCY";
	hourlyCost: number | null;
	weeklyCapacity: number | null;
	startDate: string | null;
	endDate: string | null;
};

export const STATUS_LABEL = {
	ACTIVE: "Active",
	INACTIVE: "Inactive",
} as const;

export const EMPLOYMENT_LABEL = {
	EMPLOYEE: "Employee",
	CONTRACTOR: "Contractor",
	AGENCY: "Agency",
} as const;

const EMPTY_MEMBER: TeamMemberValue = {
	name: "",
	email: null,
	role: null,
	status: "ACTIVE",
	employmentType: "EMPLOYEE",
	hourlyCost: null,
	weeklyCapacity: null,
	startDate: null,
	endDate: null,
};

function numberValue(value: string): number | null {
	if (value.trim() === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export function TeamMemberForm({
	formId,
	initialValue = EMPTY_MEMBER,
	currency,
	onSubmit,
}: {
	formId: string;
	initialValue?: TeamMemberValue;
	currency: string;
	onSubmit: (value: TeamMemberValue) => void;
}) {
	const [name, setName] = useState(initialValue.name);
	const [email, setEmail] = useState(initialValue.email ?? "");
	const [role, setRole] = useState(initialValue.role ?? "");
	const [status, setStatus] = useState(initialValue.status);
	const [employmentType, setEmploymentType] = useState(
		initialValue.employmentType,
	);
	const [hourlyCost, setHourlyCost] = useState(
		initialValue.hourlyCost?.toString() ?? "",
	);
	const [weeklyCapacity, setWeeklyCapacity] = useState(
		initialValue.weeklyCapacity?.toString() ?? "",
	);
	const [startDate, setStartDate] = useState(
		initialValue.startDate?.slice(0, 10) ?? "",
	);
	const [endDate, setEndDate] = useState(
		initialValue.endDate?.slice(0, 10) ?? "",
	);
	const nameId = useId();
	const emailId = useId();
	const roleId = useId();
	const statusId = useId();
	const employmentId = useId();
	const hourlyCostId = useId();
	const weeklyCapacityId = useId();
	const startDateId = useId();
	const endDateId = useId();

	return (
		<form
			id={formId}
			className="flex flex-col gap-6"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit({
					name: name.trim(),
					email: email.trim() || null,
					role: role.trim() || null,
					status,
					employmentType,
					hourlyCost: numberValue(hourlyCost),
					weeklyCapacity: numberValue(weeklyCapacity),
					startDate: startDate
						? new Date(`${startDate}T00:00:00.000Z`).toISOString()
						: null,
					endDate: endDate
						? new Date(`${endDate}T23:59:59.000Z`).toISOString()
						: null,
				});
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={nameId}>Name</FieldLabel>
					<Input
						id={nameId}
						name="name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						autoComplete="off"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={emailId}>Email</FieldLabel>
					<Input
						id={emailId}
						name="email"
						type="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						autoComplete="off"
						spellCheck={false}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={roleId}>Role</FieldLabel>
					<Input
						id={roleId}
						name="role"
						value={role}
						onChange={(event) => setRole(event.target.value)}
						placeholder="Product designer"
						autoComplete="off"
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={statusId}>Status</FieldLabel>
					<Select
						value={status}
						onValueChange={(value) =>
							setStatus(value as TeamMemberValue["status"])
						}
					>
						<SelectTrigger id={statusId}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{Object.entries(STATUS_LABEL).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel htmlFor={employmentId}>Employment type</FieldLabel>
					<Select
						value={employmentType}
						onValueChange={(value) =>
							setEmploymentType(value as TeamMemberValue["employmentType"])
						}
					>
						<SelectTrigger id={employmentId}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{Object.entries(EMPLOYMENT_LABEL).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel htmlFor={hourlyCostId}>
						Hourly cost ({currency})
					</FieldLabel>
					<Input
						id={hourlyCostId}
						name="hourlyCost"
						type="number"
						inputMode="decimal"
						min={0}
						step="0.01"
						value={hourlyCost}
						onChange={(event) => setHourlyCost(event.target.value)}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={weeklyCapacityId}>
						Weekly capacity (hours)
					</FieldLabel>
					<Input
						id={weeklyCapacityId}
						name="weeklyCapacity"
						type="number"
						inputMode="decimal"
						min={0}
						step="0.25"
						value={weeklyCapacity}
						onChange={(event) => setWeeklyCapacity(event.target.value)}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={startDateId}>Start date (optional)</FieldLabel>
					<Input
						id={startDateId}
						name="startDate"
						type="date"
						value={startDate}
						onChange={(event) => setStartDate(event.target.value)}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={endDateId}>End date (optional)</FieldLabel>
					<Input
						id={endDateId}
						name="endDate"
						type="date"
						value={endDate}
						onChange={(event) => setEndDate(event.target.value)}
					/>
				</Field>
			</FieldGroup>
		</form>
	);
}
