CREATE TABLE `screening_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`compoundName` varchar(200) NOT NULL,
	`cid` int,
	`smiles` text,
	`mw` text,
	`logP` text,
	`tpsa` text,
	`hbd` int,
	`hba` int,
	`boiledEgg` varchar(10),
	`admetlabRulesPassed` int,
	`logPS` text,
	`kpuuBrain` text,
	`bbbPotential` varchar(20),
	`cypScore` int,
	`cypPotential` varchar(20),
	`cypFeatures` text,
	`resultJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `screening_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `screening_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`compoundCount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `screening_sessions_id` PRIMARY KEY(`id`)
);
